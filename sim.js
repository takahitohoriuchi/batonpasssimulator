import { Runner, Baton } from './entities.js'
import { InteractionController } from './controller.js'
import { GameController } from './gameController.js'

export class Simulation {
	constructor(track) {
		this.track = track

		this.player = { paused: false, speed: 1.0 }
		this.t = 0

		this.visual = { runnerDia_m: 0.6 }

		this.zones = this.buildZones()

		this.runners = []
		this.summon({ lanes: [4], segments: ['all'] })

		// バトン：最初はleg1
		const r1 = this.runners.find((r) => r.leg === 1 && r.lane === 4) ?? this.runners[0]
		this.baton = new Baton({ holderId: r1.id, lane: r1.lane, s: r1.s })

		this.controller = new InteractionController(track)

		this.game = new GameController(this)
		this.game.enabled = true // ゲームモードON
		this.game.playerLane = 4 // デフォルト主人公

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

	// buildZones() {
	// 	return this.track.zoneScratches.map((scr) => ({
	// 		scratch: scr,
	// 		start: scr + this.track.zoneStartOffset, // ★ここは「+」にする
	// 		end: scr + this.track.zoneEndOffset, // ★ここも「+」にする
	// 	}))
	// }
	buildZones() {
		return [
			{ start: 80, end: 110 }, // 1-2
			{ start: 180, end: 210 }, // 2-3
			{ start: 280, end: 310 }, // 3-4
		]
	}

	// laneごとの1走スタート位置（s座標）
	startS(lane) {
		return this.firstLegStartS(lane)
	}

	// s → レース距離[m]（そのレーンのスタートを0mとする、0..P）
	sToRaceDist(lane, s) {
		const P = this.track.lapLengthLaneCenter(lane)
		const s0 = this.startS(lane)

		// 進行は「sが減る」なので、距離は (s0 - s) を正方向に取る
		let d = (s0 - s) % P
		if (d < 0) d += P

		// 400m種目として 0..400 に畳む（400に達したら0扱い）
		d = d % 400.0
		if (d >= 399.999) d = 0.0
		return d
	}

	// レース距離[m] → s（そのレーン上の描画位置へ変換）
	raceDistToS(lane, d) {
		const s0 = this.firstLegStartS(lane)

		// ★400mトラック前提
		let s = s0 - d

		const P = this.track.lapLengthLaneCenter(lane)
		s = ((s % P) + P) % P

		return s
	}

	// ★ legごとの「ゾーン開始位置」を返す（leg1以外）
	zoneStartForLeg(leg) {
		// leg2→zones[0], leg3→zones[1], leg4→zones[2]
		const zi = leg - 2
		const z = this.zones[zi]
		return z ? z.start : 0
	}

	// ★ 召喚
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

		for (const lane of lanes) {
			for (const leg of Array.from(legs).sort((a, b) => a - b)) {
				// ★ legごとの初期レース距離（絶対位置）
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
						dist: d0, // HUD用（後で毎フレーム上書きして整合させる）
					}),
				)
			}
		}
		

		// バトン保持者は最初のleg1（lane最小優先）
		const holder = this.runners.filter((r) => r.leg === 1).sort((a, b) => a.lane - b.lane)[0]

		if (holder && this.baton) this.baton.attachTo(holder)

		// ★保険：各レーンのleg1は必ず走る
		for (const lane of lanes) {
			const r1 = this.runners.find((r) => r.lane === lane && r.leg === 1)
			if (r1) r1.go()
		}

		
		// 召喚直後は履歴をリセット（コマ戻しが変になるのを防ぐ）
		// this.history = []
		// this.pushHistory()		

		// this.pushHistory()

		// ★ここ追加
		if (this.game) {
			this.game.reset()
		}
	}

	// ★ go()相当：指定laneの指定legを走らせる
	goLeg(lane, leg) {
		const r = this.runners.find((x) => x.lane === lane && x.leg === leg)
		if (r) r.go()
	}

	// ===== 描画線（そのまま）=====
	rebuildMarks() {
		const marks = []

		for (let lane = 1; lane <= this.track.lanes; lane++) {
			marks.push({ lane, s: this.track.finishS, halfLenM: 1.45, color: color(255, 0, 0) })
		}

		for (let lane = 1; lane <= this.track.lanes; lane++) {
			marks.push({ lane, s: this.firstLegStartS(lane), halfLenM: 1.15, color: color(255, 255, 0) })
		}
		

		// (白) バトンゾーン線：各ゾーン3本（80/100/110, 180/200/210, 280/300/310）
		const zoneLines = [80, 100, 110, 180, 200, 210, 280, 300, 310]

		for (let lane = 1; lane <= this.track.lanes; lane++) {
			for (const d of zoneLines) {
				const s = this.raceDistToS(lane, d)
				marks.push({ lane, s, halfLenM: 0.9, color: color(255) })
			}
		}

		// (グレー) 100/200/300m（レース距離基準で変換して描く）
		for (let lane = 1; lane <= this.track.lanes; lane++) {
			for (const d of [100, 200, 300]) {
				const s = this.raceDistToS(lane, d)
				marks.push({ lane, s, halfLenM: 0.75, color: color(160) })
			}
		}

		this.marks = marks
	}

	// ===== 相互作用ユーティリティ =====
	shortestArcDistance(aRunner, bRunner) {
		const P = this.track.lapLengthLaneCenter(aRunner.lane)
		let d = bRunner.s - aRunner.s
		d = ((d + P / 2) % P) - P / 2
		return d
	}
	arcDelta(receiver, passer) {
		const P = this.track.lapLengthLaneCenter(receiver.lane)
		let d = receiver.s - passer.s
		d = ((d + P / 2) % P) - P / 2
		return d
	}
	// isInZone(runner, zone) {
	// 	const P = this.track.lapLengthLaneCenter(runner.lane)
	// 	const s = ((runner.s % P) + P) % P
	// 	const a = ((zone.start % P) + P) % P
	// 	const b = ((zone.end % P) + P) % P
	// 	if (a <= b) return a <= s && s <= b
	// 	return s >= a || s <= b
	// }
	isInZone(runner, zone) {
		const d = this.sToRaceDist(runner.lane, runner.s)
		return zone.start <= d && d <= zone.end
	}

	// ===== player操作 =====
	playPauseToggle() {
		this.player.paused = !this.player.paused
	}
	stepForwardOneFrame(dtBase = 1 / 60) {
		this.stepFrame(dtBase)
	}
	stepBackwardOneFrame() {
		if (this.history.length <= 1) return
		this.history.pop()
		this.applyState(this.history[this.history.length - 1])
	}

	step(dtBase) {
		if (this.player.paused) return
		this.stepFrame(dtBase)
	}

	stepFrame(dtBase) {
		if (this.t < 0.2) {
			console.log(
				'paused:',
				this.player.paused,
				'runners:',
				this.runners.map((r) => ({
					id: r.id,
					leg: r.leg,
					run: r._is_running,
					pitch: r.pitch,
					stride: r.stride,
					s: r.s,
				})),
			)
		}
		const sp = this.player.speed
		this.t += dtBase * sp

		for (const r of this.runners) r.step(dtBase, this.track, sp)
		// ★距離表示は s から毎フレーム再計算（ズレない）
		for (const r of this.runners) {
			r.dist = this.sToRaceDist(r.lane, r.s)
		}

		const holder = this.runners.find((r) => r.id === this.baton.holderId)
		if (holder) this.baton.attachTo(holder)

		this.controller.step(this)

		this.pushHistory()

		// 既存：this.controller.step(this)
		// ↓ゲームモード中は無効にする
		if (!this.game?.enabled) {
		this.controller.step(this);
		} else {
		this.game.step();
		}
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
				phase: r.phase,
				l: r.l,
				_is_running: r._is_running,
				_is_raised_arm: r._is_raised_arm,
				_is_passing: r._is_passing,
				armReachExtra: r.armReachExtra,
				dist: r.dist,
			})),
			baton: this.baton ? { holderId: this.baton.holderId, lane: this.baton.lane, s: this.baton.s } : { holderId: null, lane: null, s: null },
			passState: this.passState,
		}
	}

	applyState(st) {
		this.t = st.t
		this.player.paused = st.player.paused
		this.player.speed = st.player.speed
		this.passState = st.passState ?? { possible: false, passerId: null, receiverId: null }

		for (const saved of st.runners) {
			const r = this.runners.find((x) => x.id === saved.id)
			if (!r) continue
			Object.assign(r, saved)
		}

		this.baton.holderId = st.baton.holderId
		this.baton.lane = st.baton.lane
		this.baton.s = st.baton.s
	}

	pushHistory() {
		this.history.push(this.snapshot())
		if (this.history.length > this.maxHistory) this.history.shift()
	}
}
