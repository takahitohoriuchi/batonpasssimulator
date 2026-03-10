import { Runner, Baton } from './entities.js'
import { InteractionController } from './controller.js'
import { GameController } from './gameController.js'

export class Simulation {
	constructor(track) {
		this.track = track

		this.player = { paused: false, speed: 1.0 }
		this.t = 0

		this.visual = {
			runnerDia_m: 0.6,
		}

		// 1-2, 2-3, 3-4 のゾーン
		this.zones = this.buildZones()

		this.runners = []
		this.batons = []

		this.summon({ lanes: [4], segments: ['all'] })

		this.controller = new InteractionController(track)

		this.game = new GameController(this)
		this.game.enabled = true
		this.game.playerLane = 4

		this.marks = []
		this.rebuildMarks()

		this.passState = { possible: false, passerId: null, receiverId: null }

		this.history = []
		this.maxHistory = 60 * 60 * 10
		this.pushHistory()
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
						pitch: 5.0,
						stride: 2.0,
						phase: 0.0,
						l: 0.8,
						isRunning,
						dist: d0,
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
		this.pushHistory()
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
		d = ((d + P / 2) % P) - P / 2
		return d
	}

	step(dtBase) {
		if (this.player.paused) return
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
				pitch: r.pitch,
				stride: r.stride,
				baseStride: r.baseStride,
				phase: r.phase,
				l: r.l,
				dist: r.dist,
				_is_running: r._is_running,
				_is_raised_arm: r._is_raised_arm,
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
						playerLane: this.game.playerLane,
						pStage: this.game.pStage,
						rStage: this.game.rStage,
						called: this.game.called,
						haiUntilMs: this.game.haiUntilMs,
						_prevPId: this.game._prevPId,
						_prevRPhase: this.game._prevRPhase,
					}
				: null,
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

		this.batons = st.batons.map((b) => new Baton(b))

		if (this.game && st.game) {
			this.game.playerLane = st.game.playerLane
			this.game.pStage = st.game.pStage
			this.game.rStage = st.game.rStage
			this.game.called = st.game.called
			this.game.haiUntilMs = st.game.haiUntilMs
			this.game._prevPId = st.game._prevPId
			this.game._prevRPhase = st.game._prevRPhase
		}
	}

	pushHistory() {
		this.history.push(this.snapshot())
		if (this.history.length > this.maxHistory) this.history.shift()
	}
}
