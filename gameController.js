export class GameController {
	constructor(sim) {
		this.sim = sim

		this.playerLane = 4
		this.enabled = true

		this._prevPId = null

		// ---- ステージ ----
		this.pStage = 0 // 0 idle / 1 call / 2 release
		this.rStage = 0 // 0 idle / 1 go / 2 receiveReady / 3 grasp

		this.called = false
		this.haiUntilMs = 0

		this._prevRPhase = null
	}

	// -----------------------
	// テンポラルP/R
	// -----------------------

	getPR() {
		const lane = this.playerLane
		const sim = this.sim

		const P = sim.runners.find((r) => r.lane === lane && r.id === sim.baton.holderId)

		if (!P) return { P: null, R: null }

		const R = sim.runners.find((r) => r.lane === lane && r.leg === P.leg + 1)

		return { P, R }
	}

	// -----------------------
	// P切替
	// -----------------------

	_resetOnPSwitch(id) {
		if (id === this._prevPId) return

		this._prevPId = id

		this.pStage = 0
		this.rStage = 0

		this.called = false
		this.haiUntilMs = 0
		this._prevRPhase = null
	}

	// -----------------------
	// キー入力
	// -----------------------

	onKeyDown(e) {
		if (!this.enabled) return
		if (e.repeat) return

		const { P, R } = this.getPR()
		if (!P || !R) return

		this._resetOnPSwitch(P.id)

		// ---- R操作 (control) ----
		if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
			e.preventDefault()

			// 1回目 → go
			if (this.rStage === 0) {
				R.go()
				this.rStage = 1
				return
			}

			// 2回目 → grasp
			if (this.rStage === 2) {
				if (this._canGrasp(P, R)) {
					this.rStage = 3
				}

				return
			}
		}

		// ---- P操作 (return) ----
		if (e.code === 'Enter') {
			e.preventDefault()

			// call
			if (this.pStage === 0) {
				this.called = true
				this.pStage = 1

				this.haiUntilMs = performance.now() + 500

				this._prevRPhase = R.phase
				return
			}

			// release
			if (this.pStage === 1) {
				if (this.rStage === 3) {
					this._release(P, R)
				}

				return
			}
		}
	}

	// -----------------------
	// grasp条件
	// -----------------------

	_canGrasp(P, R) {
		// （１）0≤φ≤π
		const phi = normalize0to2pi(P.phase)

		if (!(0 <= phi && phi <= Math.PI)) return false

		// （２）sin増加
		if (Math.cos(phi) <= 0) return false

		// （５）R状態がもらう構え
		if (this.rStage !== 2) return false

		// （４）距離条件
		const dif = Math.abs(this.sim.shortestArcDistance(P, R))

		const left = dif - R.l
		const right = Math.sin(phi) * P.l

		return left <= right
	}

	// -----------------------
	// release
	// -----------------------

	_release(P, R) {
		this.pStage = 2

		this.sim.baton.attachTo(R)

		P._is_passing = false
		R._is_passing = false
		R._is_raised_arm = false
	}

	// -----------------------
	// フレーム更新
	// -----------------------

	step() {
		if (!this.enabled) return

		const { P, R } = this.getPR()
		if (!P || !R) return

		this._resetOnPSwitch(P.id)

		// ------------------
		// もらう構え
		// ------------------

		if (this.called && this.rStage === 1) {
			const target = -Math.PI / 2

			if (this._prevRPhase === null) this._prevRPhase = R.phase

			if (crossedAngle(this._prevRPhase, R.phase, target)) {
				this.rStage = 2

				R._is_raised_arm = true

				R.phase = target
				R.pitch *= 0.9
			}

			this._prevRPhase = R.phase
		}
	}

	// -----------------------
	// HUD
	// -----------------------

	getHUD() {
		const { P, R } = this.getPR()

		return {
			P,
			R,
			pStage: this.pStage,
			rStage: this.rStage,
			hai: this.haiUntilMs,
		}
	}

	// -----------------------
	// summonリセット
	// -----------------------

	reset() {
		this._prevPId = null

		this.pStage = 0
		this.rStage = 0

		this.called = false
		this.haiUntilMs = 0
	}
}

// ---------------------------
// util
// ---------------------------

function normalize0to2pi(a) {
	let x = a
	while (x < 0) x += 2 * Math.PI
	while (x >= 2 * Math.PI) x -= 2 * Math.PI
	return x
}

function crossedAngle(prev, now, target) {
	const a = wrap(prev - target)
	const b = wrap(now - target)

	if (Math.sign(a) !== Math.sign(b)) return true

	return false
}

function wrap(x) {
	while (x > Math.PI) x -= 2 * Math.PI
	while (x < -Math.PI) x += 2 * Math.PI
	return x
}
