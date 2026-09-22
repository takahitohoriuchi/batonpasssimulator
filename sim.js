import { Runner, Baton } from './entities.js'
import { InteractionController } from './controller.js'
import { GameController } from './gameController.js'

export class Simulation {
	static get WAIT_CUE_MS() {
		return 500
	}

	constructor(track) {
		this.track = track

		this.player = { paused: false, speed: 1.0 }
		this.t = 0
		this.interpersonal = {
			enabled: true,
			waitCueEnabled: false,
			passer: {
				syncMode: 'sameTeamNext',
				rangeM: 20.0,
				K: 2.0,
				strideRangeM: 10.0,
				strideM1: 0.002,
			},
			receiver: {
				syncMode: 'sameTeamPrevious',
				rangeM: 400.0,
				K: 0.0,
				strideM2: 0.005,
			},
		}

		this.visual = {
			runnerDia_m: 0.6,
			trailLength: 0,
			trailFrameStride: 1,
		}

		// 1-2, 2-3, 3-4 のゾーン
		this.zones = this.buildZones()

		this.runners = []
		this.batons = []
		this.simulationStudy = this.createSimulationStudyState()
		this._updatingSimulationWindow = false
		this._suppressSimulationWindowUpdate = false

		this.summon({ lanes: [4], segments: ['all'] })

		this.controller = new InteractionController(track)

		this.game = new GameController(this)
		this.game.enabled = true
		this.game.playerLane = 4

		this.marks = []
		this.rebuildMarks()

		this.passState = { possible: false, passerId: null, receiverId: null }
		this.recording = this.createRecordingState()
		this.frameEventLog = []

		this.history = []
		this.maxHistory = 60 * 60 * 10
		this.refreshAllRunnerKinematics()
		this.updateSimulationCallWindow()
		this.pushHistory()
		this.failureMessage = ''
	}

	static get TARGET_TAU_DOT() {
		return -0.5
	}

	firstLegStartS(lane) {
		const stagger = 2 * Math.PI * this.track.laneW * (lane - 1)
		return -stagger
	}

	startS(lane) {
		return this.firstLegStartS(lane)
	}

	sToRaceDist(lane, s) {
		const P = this.track.lapLengthLaneCenter(lane)
		const s0 = this.startS(lane)

		let d = (s0 - s) % P
		if (d < 0) d += P

		d = d % 400.0
		if (d >= 399.999) d = 0.0
		return d
	}

	raceDistToS(lane, d) {
		const s0 = this.startS(lane)
		const P = this.track.lapLengthLaneCenter(lane)

		let s = s0 - d
		s = ((s % P) + P) % P
		return s
	}

	buildZones() {
		return [
			{ start: 80, end: 110 },
			{ start: 180, end: 210 },
			{ start: 280, end: 310 },
		]
	}

	createRecordingState() {
		return {
			active: false,
			baseFileStem: '',
			targetLane: null,
			segments: [],
			completedFiles: [],
			outputDirectoryHandle: null,
			saveMode: 'download',
		}
	}

	createSimulationStudyState() {
		return {
			enabled: false,
			receiverStartTime: 7.4,
			callTimeMin: 7.4,
			callTimeMax: 7.4,
			stepSeconds: 1 / 60,
			running: false,
		}
	}

	logFrameEvent(type, lane, passerLeg) {
		this.frameEventLog.push({ type, lane, passerLeg })
	}

	consumeFrameEventsForSegment(segment) {
		const events = new Set()
		for (const entry of this.frameEventLog) {
			if (entry.lane !== this.recording.targetLane) continue
			if (entry.passerLeg !== segment.passerLeg) continue
			events.add(entry.type)
		}
		return events
	}

	getBatonForLane(lane) {
		return this.batons.find((b) => b.lane === lane) || null
	}

	summon({ lanes, segments }) {
		const wantAll = segments.includes('all')
		const want12 = wantAll || segments.includes('12')
		const want23 = wantAll || segments.includes('23')
		const want34 = wantAll || segments.includes('34')

		const legs = new Set()
		if (want12) {
			legs.add(1)
			legs.add(2)
		}
		if (want23) {
			legs.add(2)
			legs.add(3)
		}
		if (want34) {
			legs.add(3)
			legs.add(4)
		}

		this.runners = []
		this.batons = []

		for (const lane of lanes) {
			for (const leg of Array.from(legs).sort((a, b) => a - b)) {
				let d0 = 0.0
				if (leg === 2) d0 = 80.0
				if (leg === 3) d0 = 180.0
				if (leg === 4) d0 = 280.0

				const s0 = this.raceDistToS(lane, d0)
				const isRunning = leg === 1

				this.runners.push(
					new Runner({
						id: `L${lane}-leg${leg}`,
						lane,
						leg,
						s: s0,
						phase: 0.0,
						l: 0.8,
						isRunning,
						dist: d0,
						runDistance: 0.0,
						omegaScale: 1.0,
						strideScale: 1.0,
						startTriggerOffset: 0.0,
					}),
				)
			}

			const r1 = this.runners.find((r) => r.lane === lane && r.leg === 1)
			if (r1) {
				this.batons.push(
					new Baton({
						lane,
						holderId: r1.id,
						s: r1.s,
					}),
				)
			}
		}

		this.history = []
		if (this.game) this.game.reset()
		this.recording = this.createRecordingState()
		this.refreshAllRunnerKinematics()
		if (!this._suppressSimulationWindowUpdate) {
			this.updateSimulationCallWindow()
		}
		this.pushHistory()
	}

	getRecordingButtonLabel() {
		return this.recording.active ? '■ Stop Recording' : '● Start Recording'
	}

	async toggleRecording() {
		if (this.recording.active) {
			await this.stopRecording({ auto: false })
			return
		}
		await this.startRecording()
	}

	async startRecording() {
		const outputDirectoryHandle = await pickRecordingOutputDirectory()
		if (outputDirectoryHandle === RECORDING_PICKER_CANCELLED) {
			return false
		}

		this.resetRace()

		const targetLane = this.game?.playerLane ?? this.runners[0]?.lane ?? null
		const segments = this.buildRecordingSegments(targetLane)
		if (segments.length === 0) return false

		this.recording = {
			active: true,
			baseFileStem: buildRecordingBaseFileStem(new Date(), targetLane),
			targetLane,
			segments,
			completedFiles: [],
			outputDirectoryHandle,
			saveMode: outputDirectoryHandle ? 'directory' : 'download',
		}

		this.captureRecordingFrame()
		this.player.paused = false
		return true
	}

	async stopRecording({ auto = false } = {}) {
		if (!this.recording.active) return

		this.player.paused = true
		const files = this.recording.completedFiles.concat(
			this.recording.segments
				.filter((segment) => segment.rows.length > 0 && !segment.finished)
				.map((segment) => this.buildRecordingFile(segment)),
		)

		await saveRecordingFiles(files, this.recording)

		this.recording = this.createRecordingState()
		this.player.paused = true
		if (auto) {
			// no-op: explicit flag preserved mainly for future HUD/messages
		}
	}

	buildRecordingSegments(targetLane) {
		const availableLegs = new Set(this.runners.filter((runner) => runner.lane === targetLane).map((runner) => runner.leg))
		const segmentDefs = [
			{ key: '12', passerLeg: 1, receiverLeg: 2 },
			{ key: '23', passerLeg: 2, receiverLeg: 3 },
			{ key: '34', passerLeg: 3, receiverLeg: 4 },
		]

		return segmentDefs
			.filter((def) => availableLegs.has(def.passerLeg) && availableLegs.has(def.receiverLeg))
			.map((def) => ({
				...def,
				active: def.passerLeg === 1,
				finished: false,
				rows: [],
				flags: createRecordingEventFlags(),
			}))
	}

	refreshAllRunnerKinematics({ dt = 1 / 60, commitTauState = false } = {}) {
		for (const r of this.runners) {
			r.tauToReceiver = null
			r.tauToZoneEnd = null
			r.tauToReceiverRate = null
			r.tauToZoneEndRate = null
			r.refreshKinematics({
				interpersonalOmegaComponent: 0.0,
				interpersonalStrideFactor: this.interpersonal.enabled ? this.getStoredStrideInterpersonalFactor(r) : 1.0,
				syncPartnerCount: 0,
			})
		}

		if (!this.interpersonal.enabled) {
			for (const r of this.runners) {
				r.waitCueActive = false
				r.waitCueUntilMs = 0
				r.prevTauToReceiver = null
				r.prevTauToZoneEnd = null
				r.resetPasserStrideInterpersonal()
				r.resetReceiverBrake()
			}
			return
		}

		if (!this.interpersonal.waitCueEnabled) {
			for (const r of this.runners) {
				r.waitCueActive = false
				r.waitCueUntilMs = 0
				r.resetReceiverBrake()
			}
		}

		for (const r of this.runners) {
			const { config, partners } = this.getSynchronizationContext(r)
			const partnerCount = partners.length
			const coupling =
				partnerCount > 0
					? (config.K / partnerCount) * partners.reduce((sum, p) => sum + Math.sin(p.phase - r.phase), 0.0)
					: 0.0

			r.refreshKinematics({
				interpersonalOmegaComponent: coupling,
				interpersonalStrideFactor: this.getStoredStrideInterpersonalFactor(r),
				syncPartnerCount: partnerCount,
			})
		}

		this.applyPasserStrideInterpersonal({ dt, commitTauState })
		this.applyReceiverStrideInterpersonal({ dt, commitState: commitTauState })
	}

	applyPasserStrideInterpersonal({ dt, commitTauState }) {
		const activePasserIds = new Set()
		const activeReceiverIds = new Set()

		for (const passer of this.getCurrentPassers()) {
			activePasserIds.add(passer.id)
			const receiver = this.runners.find((r) => r.lane === passer.lane && r.leg === passer.leg + 1) || null
			if (receiver && receiver.dist <= passer.dist) {
				passer.waitCueActive = false
				passer.waitCueUntilMs = 0
			}
			const ctx = this.getPasserStrideInterpersonalContext(passer, receiver, dt)
			if (ctx.waitCueActive && !passer.waitCueActive) {
				passer.waitCueUntilMs = performance.now() + Simulation.WAIT_CUE_MS
				this.logFrameEvent('e4b', passer.lane, passer.leg)
			}

			passer.waitCueActive = ctx.waitCueActive
			passer.tauToReceiver = ctx.tauPR
			passer.tauToZoneEnd = ctx.tauRB
			passer.tauToReceiverRate = ctx.tauDot
			if (commitTauState) {
				passer.passerStrideInterpersonalFactor = ctx.nextStrideFactor
			}

			passer.refreshKinematics({
				interpersonalOmegaComponent: passer.interpersonalOmegaComponent,
				interpersonalStrideFactor: commitTauState ? ctx.nextStrideFactor : passer.passerStrideInterpersonalFactor,
				syncPartnerCount: passer.syncPartnerCount,
			})

			if (receiver) {
				activeReceiverIds.add(receiver.id)
				if (ctx.activateReceiverBrake) {
					receiver.receiverBrakeActive = true
					if (receiver.enterReceiveReady()) {
						this.logFrameEvent('e5', passer.lane, passer.leg)
					}
				}
			}

			if (commitTauState) {
				passer.prevTauToReceiver = Number.isFinite(ctx.tauPR) ? ctx.tauPR : null
			}
		}

		if (!commitTauState) return

		for (const runner of this.runners) {
			if (!activePasserIds.has(runner.id)) {
				runner.waitCueActive = false
				runner.resetPasserStrideInterpersonal()
			}
			if (!activePasserIds.has(runner.id)) {
				runner.prevTauToReceiver = null
			}
			if (!activeReceiverIds.has(runner.id) && this.getRunnerRelayRole(runner) !== 'receiver') {
				runner.resetReceiverBrake()
			}
		}
	}

	applyReceiverStrideInterpersonal({ dt, commitState }) {
		for (const receiver of this.getCurrentReceivers()) {
			if (!receiver.receiverBrakeActive) continue

			const baton = this.getBatonForLane(receiver.lane)
			const passer = baton ? this.runners.find((r) => r.id === baton.holderId) || null : null
			const zone = passer ? this.zones[passer.leg - 1] : null
			const zoneRemaining = zone ? Math.max(0.0, zone.end - receiver.dist) : 0.0
			const tauRB = this.safeTime(zoneRemaining, receiver.speed())
			const prevTauRB = receiver.prevTauToZoneEnd
			const tauDotRB = Number.isFinite(prevTauRB) && Number.isFinite(tauRB) && dt > 0 ? (tauRB - prevTauRB) / dt : null
			const currentFactor = receiver.receiverStrideInterpersonalFactor
			const nextFactor = Number.isFinite(tauDotRB)
				? this.clampStrideInterpersonalFactor(currentFactor + this.interpersonal.receiver.strideM2 * tauDotRB)
				: currentFactor

			if (commitState) {
				receiver.receiverStrideInterpersonalFactor = nextFactor
				receiver.prevTauToZoneEnd = Number.isFinite(tauRB) ? tauRB : null
			}

			receiver.tauToZoneEnd = tauRB
			receiver.tauToZoneEndRate = tauDotRB
			receiver.enterReceiveReady()
			receiver.refreshKinematics({
				interpersonalOmegaComponent: receiver.interpersonalOmegaComponent,
				interpersonalStrideFactor: commitState ? nextFactor : currentFactor,
				syncPartnerCount: receiver.syncPartnerCount,
			})
		}
	}

	getPasserStrideInterpersonalContext(passer, receiver, dt) {
		const currentFactor = passer.passerStrideInterpersonalFactor ?? 1.0
		const empty = { nextStrideFactor: currentFactor, waitCueActive: false, activateReceiverBrake: false, tauPR: null, tauRB: null, tauDot: null }
		if (!receiver) return empty
		if (!receiver._is_running) return empty

		const zone = this.zones[passer.leg - 1]
		if (!zone) return empty

		const vP = passer.speed()
		const vR = receiver.speed()
		const gap = receiver.dist - passer.dist
		const zoneRemaining = Math.max(0.0, zone.end - receiver.dist)
		const tauRB = this.safeTime(zoneRemaining, vR)

		if (!(gap > 0) || !(vP > 0)) {
			return empty
		}

		const relativeSpeed = vP - vR
		const tauPR = relativeSpeed > 1e-6 ? this.safeTime(gap, relativeSpeed) : Infinity
		const prevTau = passer.prevTauToReceiver
		const tauDot = Number.isFinite(prevTau) && Number.isFinite(tauPR) && dt > 0 ? (tauPR - prevTau) / dt : null
		const waitCueActive = this.interpersonal.waitCueEnabled && receiver._is_running && tauRB < tauPR
		const strideRangeM = this.interpersonal.passer.strideRangeM
		const shouldAdjustStride = vP > vR && gap <= strideRangeM && Number.isFinite(tauDot) && tauDot < Simulation.TARGET_TAU_DOT
		const nextStrideFactor = shouldAdjustStride
			? this.clampStrideInterpersonalFactor(currentFactor - this.interpersonal.passer.strideM1 * (Simulation.TARGET_TAU_DOT - tauDot))
			: currentFactor

		return {
			nextStrideFactor,
			waitCueActive,
			activateReceiverBrake: waitCueActive,
			tauPR,
			tauRB,
			tauDot,
		}
	}

	getStoredStrideInterpersonalFactor(runner) {
		return this.clampStrideInterpersonalFactor((runner.passerStrideInterpersonalFactor ?? 1.0) * (runner.receiverStrideInterpersonalFactor ?? 1.0))
	}

	clampStrideInterpersonalFactor(value) {
		return Math.max(0.05, Math.min(1.0, value))
	}

	getSynchronizationContext(runner) {
		if (!this.interpersonal.enabled || !this.isSynchronizationEligible(runner)) {
			return { config: { K: 0.0, rangeM: 0.0, syncMode: 'none' }, partners: [] }
		}

		const role = this.getRunnerRelayRole(runner)
		if (role === 'passer' && this.isPasserSynchronizationActive(runner)) {
			return {
				config: this.interpersonal.passer,
				partners: this.getPasserSynchronizationPartners(runner),
			}
		}
		if (role === 'receiver' && this.isReceiverSynchronizationActive(runner)) {
			return {
				config: this.interpersonal.receiver,
				partners: this.getReceiverSynchronizationPartners(runner),
			}
		}

		return { config: { K: 0.0, rangeM: 0.0, syncMode: 'none' }, partners: [] }
	}

	isSynchronizationEligible(runner) {
		return runner._is_running && !runner._is_raised_arm
	}

	isPasserSynchronizationActive(runner) {
		return this.isSynchronizationEligible(runner)
	}

	isReceiverSynchronizationActive(runner) {
		// R は出走した瞬間から同期対象だが、腕上げ状態に入ったら同期しない
		return this.isSynchronizationEligible(runner)
	}

	getRunnerRelayRole(runner) {
		const baton = this.getBatonForLane(runner.lane)
		if (!baton) return 'none'

		if (baton.holderId === runner.id) return 'passer'

		const holder = this.runners.find((r) => r.id === baton.holderId)
		if (!holder) return 'none'

		const receiver = this.runners.find((r) => r.lane === runner.lane && r.leg === holder.leg + 1)
		if (receiver?.id === runner.id) return 'receiver'

		return 'none'
	}

	getPasserSynchronizationPartners(runner) {
		const mode = this.interpersonal.passer.syncMode
		let candidates = []

		if (mode === 'sameTeamNext') {
			candidates = this.getCurrentReceivers().filter((other) => other.lane === runner.lane)
		} else if (mode === 'allNext') {
			candidates = this.getCurrentReceivers()
		} else if (mode === 'allRunning') {
			candidates = this.runners.filter((other) => other.id !== runner.id && other._is_running)
		}

		return candidates.filter((other) => other.id !== runner.id && this.isSynchronizationEligible(other) && this.isWithinSyncRange(runner, other, this.interpersonal.passer.rangeM))
	}

	getReceiverSynchronizationPartners(runner) {
		const mode = this.interpersonal.receiver.syncMode
		let candidates = []

		if (mode === 'sameTeamPrevious') {
			candidates = this.getCurrentPassers().filter((other) => other.lane === runner.lane)
		} else if (mode === 'allPrevious') {
			candidates = this.getCurrentPassers()
		} else if (mode === 'allRunning') {
			candidates = this.runners.filter((other) => other.id !== runner.id && other._is_running)
		}

		return candidates.filter((other) => other.id !== runner.id && this.isSynchronizationEligible(other) && this.isWithinSyncRange(runner, other, this.interpersonal.receiver.rangeM))
	}

	getCurrentPassers() {
		return this.batons
			.map((baton) => this.runners.find((r) => r.id === baton.holderId) || null)
			.filter(Boolean)
	}

	getCurrentReceivers() {
		return this.getCurrentPassers()
			.map((passer) => this.runners.find((r) => r.lane === passer.lane && r.leg === passer.leg + 1) || null)
			.filter(Boolean)
	}

	forwardRaceDistanceMeters(fromDist, toDist) {
		return ((toDist - fromDist) % 400 + 400) % 400
	}

	safeTime(distance, speed) {
		if (!(distance >= 0)) return null
		if (!(speed > 1e-6)) return Infinity
		return distance / speed
	}

	isWithinSyncRange(aRunner, bRunner, rangeM) {
		return Math.abs(this.shortestRaceDistanceMeters(aRunner.dist, bRunner.dist)) <= rangeM
	}

	shortestRaceDistanceMeters(aDist, bDist) {
		let d = bDist - aDist
		d = (((d + 200) % 400) + 400) % 400 - 200
		return d
	}

	getReceiverStartRaceDist(leg) {
		if (leg === 2) return 80.0
		if (leg === 3) return 180.0
		if (leg === 4) return 280.0
		return 0.0
	}

	getStartTriggerRaceDist(runner) {
		return Math.max(0.0, this.getReceiverStartRaceDist(runner.leg) - (runner.startTriggerOffset ?? 0.0))
	}

	getVisibleMarks() {
		return [...this.marks, ...this.getStartTriggerMarks()]
	}

	getTrailStates() {
		const trailLength = Math.max(0, Math.floor(this.visual.trailLength ?? 0))
		const frameStride = Math.max(1, Math.floor(this.visual.trailFrameStride ?? 1))
		if (trailLength <= 0 || this.history.length <= 1) return []

		const states = []
		for (let sampleIndex = trailLength; sampleIndex >= 1; sampleIndex--) {
			const historyIndex = this.history.length - 1 - sampleIndex * frameStride
			if (historyIndex < 0) continue
			states.push(this.history[historyIndex])
		}
		return states
	}

	getStartTriggerMarks() {
		if (this.game?.enabled) return []

		return this.runners
			.filter((r) => r.leg > 1)
			.map((r) => ({
				lane: r.lane,
				s: this.raceDistToS(r.lane, this.getStartTriggerRaceDist(r)),
				halfLenM: this.track.laneW / 4,
				color: color(90, 210, 255),
			}))
	}

	captureRecordingFrame() {
		if (!this.recording.active) return

		const targetLane = this.recording.targetLane
		let allFinished = true

		for (const segment of this.recording.segments) {
			if (segment.finished) continue

			const passer = this.runners.find((runner) => runner.lane === targetLane && runner.leg === segment.passerLeg) || null
			const receiver = this.runners.find((runner) => runner.lane === targetLane && runner.leg === segment.receiverLeg) || null
			if (!passer || !receiver) {
				segment.finished = true
				continue
			}

			const baton = this.getBatonForLane(targetLane)
			const holderId = baton?.holderId ?? null

			if (!segment.active) {
				segment.active = holderId === passer.id
			}

			if (!segment.active) {
				allFinished = false
				continue
			}

			const frameFlags = this.computeRecordingFrameFlags(segment, passer, receiver, holderId)
			mergeRecordingEventFlags(segment.flags, frameFlags)
			segment.rows.push(this.buildRecordingRow(segment, passer, receiver))

			if (segment.flags.e8) {
				segment.finished = true
				this.recording.completedFiles.push(this.buildRecordingFile(segment))
			} else {
				allFinished = false
			}
		}

		if (allFinished) {
			void this.stopRecording({ auto: true })
		}
	}

	computeRecordingFrameFlags(segment, passer, receiver, holderId) {
		const frameEvents = this.consumeFrameEventsForSegment(segment)
		const gamePair =
			this.game?.enabled && this.game.playerLane === this.recording.targetLane
				? this.game.getPR()
				: { P: null, R: null }
		const isCurrentGamePair = gamePair.P?.id === passer.id && gamePair.R?.id === receiver.id

		const e2 = frameEvents.has('e2') || receiver._is_running
		const e4a = frameEvents.has('e4a') || (isCurrentGamePair ? this.game.called || this.game.pStage >= 1 : false)
		const e4b = frameEvents.has('e4b') || passer.waitCueActive || passer.waitCueUntilMs > performance.now()
		const e5 = frameEvents.has('e5') || receiver._is_receive_ready
		const e6 = frameEvents.has('e6') || passer._is_offer_pose || (isCurrentGamePair && this.game.pStage >= 2)
		const e7 = frameEvents.has('e7') || (isCurrentGamePair && this.game.rStage >= 3) || holderId === receiver.id
		const e8 = frameEvents.has('e8') || holderId === receiver.id

		return { e2, e4a, e4b, e5, e6, e7, e8 }
	}

	buildRecordingRow(segment, passer, receiver) {
		return {
			t: this.t,
			xP: passer.dist,
			xR: receiver.dist,
			vP: passer.speed(),
			vR: receiver.speed(),
			phiP: passer.phase,
			phiR: receiver.phase,
			F_intra: omegaToPitchPerSecond(passer.individualOmegaComponent),
			F_inter: omegaToPitchPerSecond(passer.interpersonalOmegaComponent),
			L_intra: passer.individualStrideComponent,
			L_inter: passer.interpersonalStrideFactor,
			tauDotPR: passer.tauToReceiverRate,
			tauPR: passer.tauToReceiver,
			tauRB: passer.tauToZoneEnd,
			e2: segment.flags.e2 ? 1 : 0,
			e4a: segment.flags.e4a ? 1 : 0,
			e4b: segment.flags.e4b ? 1 : 0,
			e5: segment.flags.e5 ? 1 : 0,
			e6: segment.flags.e6 ? 1 : 0,
			e7: segment.flags.e7 ? 1 : 0,
			e8: segment.flags.e8 ? 1 : 0,
		}
	}

	buildRecordingFile(segment) {
		return {
			name: `${this.recording.baseFileStem}_${segment.key}.csv`,
			csv: serializeRecordingRows(segment.rows),
		}
	}

	getSimulationStudyButtonLabel() {
		return this.simulationStudy.running ? 'Running...' : 'Run Simulation'
	}

	updateSimulationCallWindow() {
		if (this._updatingSimulationWindow) {
			return {
				min: this.simulationStudy.callTimeMin,
				max: this.simulationStudy.callTimeMax,
			}
		}

		this._updatingSimulationWindow = true
		try {
			const min = Math.max(0.0, Number(this.simulationStudy.receiverStartTime) || 0.0)
			let max = min

			try {
				const estimated = this.estimateSimulationCallUpperBound(min)
				if (Number.isFinite(estimated) && estimated >= min) {
					max = estimated
				}
			} catch (_error) {
				max = min
			}

			this.simulationStudy.receiverStartTime = min
			this.simulationStudy.callTimeMin = min
			this.simulationStudy.callTimeMax = max
			return { min, max }
		} finally {
			this._updatingSimulationWindow = false
		}
	}

	estimateSimulationCallUpperBound(receiverStartTime, dtBase = 1 / 60) {
		return this.withPreservedState(() => {
			if (!this.prepareSimulationStudyRun()) return receiverStartTime

			const maxSimTime = Math.max(20, receiverStartTime + 12)
			let receiverStarted = false

			while (this.t <= maxSimTime && !this.failureMessage) {
				if (!receiverStarted && this.t + 1e-9 >= receiverStartTime) {
					const { P, R } = this.game.getPR()
					if (P && R && this.game.startReceiver(P, R)) {
						receiverStarted = true
					}
				}

				this.stepFrame(dtBase)
			}

			return this.t
		})
	}

	async runSimulationStudy() {
		if (this.simulationStudy.running) return false

		const outputDirectoryHandle = await pickRecordingOutputDirectory()
		if (outputDirectoryHandle === RECORDING_PICKER_CANCELLED) {
			return false
		}

		this.simulationStudy.running = true
		try {
			const { min, max } = this.updateSimulationCallWindow()
			const rows = this.executeSimulationStudyRows({
				receiverStartTime: min,
				callTimeMax: max,
				dtBase: this.simulationStudy.stepSeconds,
			})

			const lane = this.game?.playerLane ?? this.runners[0]?.lane ?? 0
			const file = {
				name: `${buildSimulationBaseFileStem(new Date(), lane)}.csv`,
				csv: serializeSimulationStudyRows(rows),
			}

			await saveRecordingFiles(
				[file],
				{
					saveMode: outputDirectoryHandle ? 'directory' : 'download',
					outputDirectoryHandle,
				},
			)
			return true
		} finally {
			this.simulationStudy.running = false
		}
	}

	executeSimulationStudyRows({ receiverStartTime, callTimeMax, dtBase }) {
		const step = Math.max(1 / 240, dtBase || 1 / 60)
		const rows = []

		for (let callTime = receiverStartTime; callTime <= callTimeMax + 1e-9; callTime += step) {
			rows.push(this.simulateScheduledCallTrial({
				receiverStartTime,
				callTime: roundSimulationTime(callTime),
				dtBase: step,
			}))
		}

		if (rows.length === 0) {
			rows.push(
				this.simulateScheduledCallTrial({
					receiverStartTime,
					callTime: receiverStartTime,
					dtBase: step,
				}),
			)
		}

		return rows
	}

	simulateScheduledCallTrial({ receiverStartTime, callTime, dtBase }) {
		return this.withPreservedState(() => {
			const prepared = this.prepareSimulationStudyRun()
			if (!prepared) {
				return {
					scheduledE2Time: receiverStartTime,
					scheduledE4aTime: callTime,
					result: 'missing-player-pair',
					e4a: null,
					e6: null,
				}
			}

			const maxSimTime = Math.max(20, callTime + 8, receiverStartTime + 12)
			let receiverStarted = false
			let called = false
			let e4aSnapshot = null
			let e6Snapshot = null

			while (this.t <= maxSimTime && !this.failureMessage && !e6Snapshot) {
				let pair = this.game.getPR()

				if (!receiverStarted && this.t + 1e-9 >= receiverStartTime) {
					if (pair.P && pair.R && this.game.startReceiver(pair.P, pair.R)) {
						receiverStarted = true
					}
				}

				pair = this.game.getPR()
				if (receiverStarted && !called && this.t + 1e-9 >= callTime) {
					if (pair.P && pair.R) {
						this.game.call(pair.P, pair.R)
						if (this.game.called) {
							called = true
							e4aSnapshot = this.buildSimulationEventSnapshot(pair.P, pair.R)
						}
					}
				}

				this.stepFrame(dtBase)

				pair = this.game.getPR()
				if (!e6Snapshot && this.game.pStage >= 2 && pair.P && pair.R) {
					e6Snapshot = this.buildSimulationEventSnapshot(pair.P, pair.R)
				}
			}

			return {
				scheduledE2Time: receiverStartTime,
				scheduledE4aTime: callTime,
				result: e6Snapshot ? 'offered' : this.failureMessage || 'timeout',
				e4a: e4aSnapshot,
				e6: e6Snapshot,
			}
		})
	}

	buildSimulationEventSnapshot(passer, receiver) {
		return {
			t: this.t,
			X_P: passer.dist,
			X_R: receiver.dist,
			v_P: passer.speed(),
			v_R: receiver.speed(),
			phi_P: passer.phase,
			phi_R: receiver.phase,
			F_intra: omegaToPitchPerSecond(passer.individualOmegaComponent),
			F_inter: omegaToPitchPerSecond(passer.interpersonalOmegaComponent),
			L_intra: passer.individualStrideComponent,
			L_inter: passer.interpersonalStrideFactor,
			tauDotPR: passer.tauToReceiverRate,
			tauPR: passer.tauToReceiver,
			tauRB: passer.tauToZoneEnd,
		}
	}

	prepareSimulationStudyRun() {
		this._suppressSimulationWindowUpdate = true
		try {
			this.resetRace()
		} finally {
			this._suppressSimulationWindowUpdate = false
		}
		this.player.speed = 1.0
		this.player.paused = true
		this.failureMessage = ''
		this.frameEventLog = []
		if (this.game) {
			this.game.enabled = true
			this.game.reset()
		}

		const { P, R } = this.game?.getPR?.() ?? { P: null, R: null }
		return Boolean(P && R)
	}

	withPreservedState(callback) {
		const snapshot = structuredClone(this.snapshot())
		const history = structuredClone(this.history)
		const frameEventLog = structuredClone(this.frameEventLog)
		const recording = this.recording
		const gameEnabled = this.game?.enabled ?? true

		try {
			return callback()
		} finally {
			this.applyState(snapshot)
			if (this.game) {
				this.game.enabled = gameEnabled
			}
			this.history = history
			this.frameEventLog = frameEventLog
			this.recording = recording
		}
	}

	isRunnerInZone(runner, zone) {
		return zone.start <= runner.dist && runner.dist <= zone.end
	}

	didRunnerCrossRaceDist(runner, raceDist) {
		return runner.prevDist < raceDist && raceDist <= runner.dist
	}

	rebuildMarks() {
		const marks = []

		// フィニッシュ
		for (let lane = 1; lane <= this.track.lanes; lane++) {
			marks.push({ lane, s: this.track.finishS, halfLenM: 1.45, color: color(255, 0, 0) })
		}

		// 1走スタート
		for (let lane = 1; lane <= this.track.lanes; lane++) {
			marks.push({ lane, s: this.firstLegStartS(lane), halfLenM: 1.15, color: color(255, 255, 0) })
		}

		// ゾーン線：80/100/110, 180/200/210, 280/300/310
		const zoneLines = [80, 100, 110, 180, 200, 210, 280, 300, 310]
		for (let lane = 1; lane <= this.track.lanes; lane++) {
			for (const d of zoneLines) {
				const s = this.raceDistToS(lane, d)
				marks.push({ lane, s, halfLenM: 0.9, color: color(255) })
			}
		}

		// 100/200/300m
		for (let lane = 1; lane <= this.track.lanes; lane++) {
			for (const d of [100, 200, 300]) {
				const s = this.raceDistToS(lane, d)
				marks.push({ lane, s, halfLenM: 0.75, color: color(160) })
			}
		}

		this.marks = marks
	}

	shortestArcDistance(aRunner, bRunner) {
		const P = this.track.lapLengthLaneCenter(aRunner.lane)
		let d = bRunner.s - aRunner.s
		d = (((d + P / 2) % P) + P) % P - P / 2
		return d
	}

	step(dtBase) {
		const dt = dtBase * this.player.speed
		if (this.player.paused) {
			this.refreshAllRunnerKinematics({ dt, commitTauState: false })
			return
		}
		this.stepFrame(dtBase)
	}

	playPauseToggle() {
		this.player.paused = !this.player.paused
	}
	stepForwardOneFrame(dtBase = 1 / 60) {
		this.player.paused = true
		this.stepFrame(dtBase)
	}

	stepBackwardOneFrame() {
		this.player.paused = true
		if (this.history.length <= 1) return
		this.history.pop()
		this.applyState(this.history[this.history.length - 1])
	}

	stepFrame(dtBase) {
		const sp = this.player.speed
		this.t += dtBase * sp

		this.refreshAllRunnerKinematics({ dt: dtBase * sp, commitTauState: false })

		for (const r of this.runners) {
			r.prevDist = r.dist
		}

		for (const r of this.runners) {
			r.step(dtBase, this.track, sp)
		}

		// distは毎フレーム s から再計算
		for (const r of this.runners) {
			r.dist = this.sToRaceDist(r.lane, r.s)
		}

		// 各チームのバトンをそれぞれの保持者に追従
		for (const b of this.batons) {
			const holder = this.runners.find((r) => r.id === b.holderId)
			if (holder) b.attachTo(holder)
		}

		// ゲーム中は自動受け渡しを止める
		if (this.game?.enabled) {
			this.game.step()
		} else {
			this.controller.step(this)
		}

		this.refreshAllRunnerKinematics({ dt: dtBase * sp, commitTauState: true })
		this.captureRecordingFrame()
		this.frameEventLog = []
		this.pushHistory()
	}

	snapshot() {
		return {
			t: this.t,
			player: { paused: this.player.paused, speed: this.player.speed },
			runners: this.runners.map((r) => ({
				id: r.id,
				lane: r.lane,
				leg: r.leg,
				s: r.s,
				runDistance: r.runDistance,
				prevDist: r.prevDist,
				omega: r.omega,
				omegaScale: r.omegaScale,
				stride: r.stride,
				strideScale: r.strideScale,
				startTriggerOffset: r.startTriggerOffset,
				individualOmegaComponent: r.individualOmegaComponent,
				interpersonalOmegaComponent: r.interpersonalOmegaComponent,
				syncPartnerCount: r.syncPartnerCount,
				individualStrideComponent: r.individualStrideComponent,
				interpersonalStrideFactor: r.interpersonalStrideFactor,
				passerStrideInterpersonalFactor: r.passerStrideInterpersonalFactor,
				tauToReceiver: r.tauToReceiver,
				prevTauToReceiver: r.prevTauToReceiver,
				tauToZoneEnd: r.tauToZoneEnd,
				prevTauToZoneEnd: r.prevTauToZoneEnd,
				tauToReceiverRate: r.tauToReceiverRate,
				tauToZoneEndRate: r.tauToZoneEndRate,
				waitCueActive: r.waitCueActive,
				waitCueUntilMs: r.waitCueUntilMs,
				receiverBrakeActive: r.receiverBrakeActive,
				receiverStrideInterpersonalFactor: r.receiverStrideInterpersonalFactor,
				phase: r.phase,
				l: r.l,
				dist: r.dist,
				_is_running: r._is_running,
				_is_raised_arm: r._is_raised_arm,
				_is_offer_pose: r._is_offer_pose,
				_is_passing: r._is_passing,
				_is_receive_ready: r._is_receive_ready,
				armReachExtra: r.armReachExtra,
			})),
			batons: this.batons.map((b) => ({
				lane: b.lane,
				holderId: b.holderId,
				s: b.s,
			})),
			game: this.game
				? {
						enabled: this.game.enabled,
						playerLane: this.game.playerLane,
						pStage: this.game.pStage,
						rStage: this.game.rStage,
						called: this.game.called,
						haiUntilMs: this.game.haiUntilMs,
						_prevPId: this.game._prevPId,
						_prevRPhase: this.game._prevRPhase,
						canOfferNow: this.game.canOfferNow,
						successMessage: this.game.successMessage,
					}
				: null,
			interpersonal: {
				enabled: this.interpersonal.enabled,
				waitCueEnabled: this.interpersonal.waitCueEnabled,
				passer: { ...this.interpersonal.passer },
				receiver: { ...this.interpersonal.receiver },
			},
			visual: { ...this.visual },
			failureMessage: this.failureMessage,
		}
	}

	applyState(st) {
		this.t = st.t
		this.player.paused = st.player.paused
		this.player.speed = st.player.speed

		for (const saved of st.runners) {
			const r = this.runners.find((x) => x.id === saved.id)
			if (r) Object.assign(r, saved)
		}

		if (st.interpersonal) {
			this.interpersonal.enabled = st.interpersonal.enabled
			this.interpersonal.waitCueEnabled = st.interpersonal.waitCueEnabled ?? this.interpersonal.waitCueEnabled
			Object.assign(this.interpersonal.passer, st.interpersonal.passer ?? {})
			Object.assign(this.interpersonal.receiver, st.interpersonal.receiver ?? {})
		}
		if (st.visual) {
			Object.assign(this.visual, st.visual)
		}

		this.refreshAllRunnerKinematics({ commitTauState: false })

		this.batons = st.batons.map((b) => new Baton(b))

		if (this.game && st.game) {
			this.game.enabled = st.game.enabled ?? this.game.enabled
			this.game.playerLane = st.game.playerLane
			this.game.pStage = st.game.pStage
			this.game.rStage = st.game.rStage
			this.game.called = st.game.called
			this.game.haiUntilMs = st.game.haiUntilMs
			this.game._prevPId = st.game._prevPId
			this.game._prevRPhase = st.game._prevRPhase
			this.game.canOfferNow = st.game.canOfferNow
			this.game.successMessage = st.game.successMessage ?? false
		}
		this.failureMessage = st.failureMessage ?? ''
	}

	pushHistory() {
		this.history.push(this.snapshot())
		if (this.history.length > this.maxHistory) this.history.shift()
	}
	resetRace() {
		// いまのrunnerの係数/l などは保持しつつ、位置と状態だけ戻す
		for (const r of this.runners) {
			let d0 = 0.0
			if (r.leg === 2) d0 = 80.0
			if (r.leg === 3) d0 = 180.0
			if (r.leg === 4) d0 = 280.0

			r.s = this.raceDistToS(r.lane, d0)
			r.dist = d0
			r.prevDist = d0
			r.runDistance = 0.0

			r.phase = 0.0
			r.tauToReceiver = null
			r.prevTauToReceiver = null
			r.tauToZoneEnd = null
			r.prevTauToZoneEnd = null
			r.tauToReceiverRate = null
			r.tauToZoneEndRate = null
			r.waitCueActive = false
			r.waitCueUntilMs = 0
			r.resetPasserStrideInterpersonal()
			r.resetReceiverBrake()

			r._is_running = r.leg === 1
			r._is_raised_arm = false
			r._is_receive_ready = false
			r._is_offer_pose = false
			r._is_passing = false
		}

		// 各チームのバトンを1走に戻す
		this.batons = []
		const lanes = Array.from(new Set(this.runners.map((r) => r.lane)))
		for (const lane of lanes) {
			const r1 = this.runners.find((r) => r.lane === lane && r.leg === 1)
			if (r1) {
				this.batons.push(
					new Baton({
						lane,
						holderId: r1.id,
						s: r1.s,
					}),
				)
			}
		}

		this.t = 0
		this.failureMessage = ''
		this.player.paused = true // reset後はPAUSEのまま

		this.game?.reset()
		this.refreshAllRunnerKinematics({ commitTauState: true })
		this.recording = this.createRecordingState()
		if (!this._suppressSimulationWindowUpdate) {
			this.updateSimulationCallWindow()
		}

		this.history = []
		this.pushHistory()
	}
}

function createRecordingEventFlags() {
	return {
		e2: false,
		e4a: false,
		e4b: false,
		e5: false,
		e6: false,
		e7: false,
		e8: false,
	}
}

function mergeRecordingEventFlags(target, source) {
	for (const key of Object.keys(target)) {
		target[key] = target[key] || Boolean(source[key])
	}
}

function omegaToPitchPerSecond(omega) {
	return omega / Math.PI
}

function buildRecordingBaseFileStem(date, lane) {
	const pad2 = (value) => String(value).padStart(2, '0')
	const timestamp = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}_${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
	return `relay_record_lane${lane}_${timestamp}`
}

function buildSimulationBaseFileStem(date, lane) {
	const pad2 = (value) => String(value).padStart(2, '0')
	const timestamp = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}_${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
	return `relay_simulation_lane${lane}_${timestamp}`
}

function serializeRecordingRows(rows) {
	const header = ['t', 'xP', 'xR', 'vP', 'vR', 'phiP', 'phiR', 'F^intra', 'F^inter', 'L^intra', 'L^inter', 'tauドットPR', 'tauPR', 'tauRB', 'e2', 'e4a', 'e4b', 'e5', 'e6', 'e7', 'e8']
	const lines = [header.join(',')]
	for (const row of rows) {
		lines.push(
			[
				row.t,
				row.xP,
				row.xR,
				row.vP,
				row.vR,
				row.phiP,
				row.phiR,
				row.F_intra,
				row.F_inter,
				row.L_intra,
				row.L_inter,
				row.tauDotPR,
				row.tauPR,
				row.tauRB,
				row.e2,
				row.e4a,
				row.e4b,
				row.e5,
				row.e6,
				row.e7,
				row.e8,
			]
				.map(formatCsvValue)
				.join(','),
		)
	}
	return lines.join('\n')
}

function serializeSimulationStudyRows(rows) {
	const eventColumns = [
		['t', 't'],
		['X_P', 'X_P'],
		['X_R', 'X_R'],
		['v_P', 'v_P'],
		['v_R', 'v_R'],
		['phi_P', 'phi_P'],
		['phi_R', 'phi_R'],
		['F^intra', 'F_intra'],
		['F^inter', 'F_inter'],
		['L^intra', 'L_intra'],
		['L^inter', 'L_inter'],
		['tauドットPR', 'tauDotPR'],
		['tauPR', 'tauPR'],
		['tauRB', 'tauRB'],
	]
	const header = ['scheduled_e2_time', 'scheduled_e4a_time', 'result']
	for (const prefix of ['e4a', 'e6']) {
		for (const [label] of eventColumns) {
			header.push(`${prefix}_${label}`)
		}
	}

	const lines = [header.join(',')]
	for (const row of rows) {
		const values = [row.scheduledE2Time, row.scheduledE4aTime, row.result]
		for (const eventRow of [row.e4a, row.e6]) {
			for (const [, key] of eventColumns) {
				values.push(eventRow?.[key] ?? null)
			}
		}
		lines.push(values.map(formatCsvValue).join(','))
	}

	return lines.join('\n')
}

function roundSimulationTime(value) {
	return Math.round(value * 1000) / 1000
}

function formatCsvValue(value) {
	if (value === null || value === undefined) return ''
	if (value === Infinity) return 'Infinity'
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return ''
		return String(value)
	}
	const text = String(value)
	return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function downloadCsvFile(filename, csvText) {
	if (typeof document === 'undefined') return
	const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.style.display = 'none'
	document.body?.appendChild?.(link)
	link.click()
	link.remove?.()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

const RECORDING_PICKER_CANCELLED = Symbol('recording-picker-cancelled')

async function pickRecordingOutputDirectory() {
	if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
		return null
	}

	try {
		return await window.showDirectoryPicker({ mode: 'readwrite' })
	} catch (error) {
		if (error?.name === 'AbortError') {
			return RECORDING_PICKER_CANCELLED
		}
		console.warn('Failed to pick recording output directory; falling back to browser download.', error)
		return null
	}
}

async function saveRecordingFiles(files, recordingState) {
	if (recordingState.saveMode === 'directory' && recordingState.outputDirectoryHandle) {
		try {
			for (const file of files) {
				const fileHandle = await recordingState.outputDirectoryHandle.getFileHandle(file.name, { create: true })
				const writable = await fileHandle.createWritable()
				await writable.write(`\uFEFF${file.csv}`)
				await writable.close()
			}
			return
		} catch (error) {
			console.warn('Failed to save recording files to the selected directory; falling back to browser download.', error)
		}
	}

	for (const file of files) {
		downloadCsvFile(file.name, file.csv)
	}
}
