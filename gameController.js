export class GameController {
	constructor(sim) {
		this.sim = sim

		this.enabled = true
		this.playerLane = 4

		this._prevPId = null

		// P: 0 idle / 1 called / 2 released
		this.pStage = 0

		// R: 0 idle / 1 go / 2 receiveReady / 3 grasp
		this.rStage = 0

		this.called = false
		this.haiUntilMs = 0

		this._prevRPhase = null
	}

	reset() {
		this._prevPId = null
		this.pStage = 0
		this.rStage = 0
		this.called = false
		this.haiUntilMs = 0
		this._prevRPhase = null
	}

	getPlayerBaton() {
		return this.sim.getBatonForLane(this.playerLane)
	}

	getPR() {
		const baton = this.getPlayerBaton()
		if (!baton) return { P: null, R: null }

		const P = this.sim.runners.find((r) => r.id === baton.holderId) || null
		if (!P) return { P: null, R: null }

		const R = this.sim.runners.find((r) => r.lane === P.lane && r.leg === P.leg + 1) || null
		return { P, R }
	}

	_resetOnPSwitch(newPId) {
		if (newPId === this._prevPId) return

		this._prevPId = newPId
		this.pStage = 0
		this.rStage = 0
		this.called = false
		this.haiUntilMs = 0
		this._prevRPhase = null
	}

	onKeyDown(e) {
		if (!this.enabled) return
		if (e.repeat) return

		const { P, R } = this.getPR()
		if (!P || !R) return

		this._resetOnPSwitch(P.id)

		// R操作 = Control
		if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
			e.preventDefault()

			// 1回目: go
			if (this.rStage === 0) {
				R.go()
				this.rStage = 1
				return
			}

			// 2回目: grasp（条件を満たした時だけ）
			if (this.rStage === 2) {
				if (this.canGrasp(P, R)) {
					this.rStage = 3
				}
				return
			}
		}

		// P操作 = Enter
		if (e.code === 'Enter') {
			e.preventDefault()

			// 1回目: call
			if (this.pStage === 0) {
				this.called = true
				this.pStage = 1
				this.haiUntilMs = performance.now() + 500
				this._prevRPhase = R.phase
				return
			}

			// 2回目: release（Rがgrasp済の時だけ）
			if (this.pStage === 1) {
				if (this.rStage === 3) {
					this.release(P, R)
				}
				return
			}
		}
	}

	canGrasp(P, R) {
		// （５）Rがもらう構え
		if (this.rStage !== 2) return false

		// P位相を 0..2π に正規化
		const phi = normalize0to2pi(P.phase)

		// （１）0≤φ≤π
		if (!(0 <= phi && phi <= Math.PI)) return false

		// （２）sin増加フェーズ（cos>0）
		if (Math.cos(phi) <= 0) return false

		// （４）距離条件
		const dif = Math.abs(this.sim.shortestArcDistance(P, R))
		return dif - R.l <= Math.sin(phi) * P.l
	}

	release(P, R) {
		const baton = this.getPlayerBaton()
		if (!baton) return

		this.pStage = 2

		// Pはその場でストップ
		P.stop()
		P._is_passing = false

		// バトン移動
		baton.attachTo(R)

		// Rの構えはここで解除
		R.exitReceiveReady()
		R._is_passing = false
	}

	step() {
		if (!this.enabled) return

		const { P, R } = this.getPR()
		if (!P || !R) return

		this._resetOnPSwitch(P.id)

		// call後、R位相が1.5π相当（=-π/2）になった瞬間にもらう構え
		if (this.called && this.rStage === 1) {
			const target = -Math.PI / 2

			if (this._prevRPhase == null) this._prevRPhase = R.phase

			if (crossedAngle(this._prevRPhase, R.phase, target)) {
				R.enterReceiveReady()
				this.rStage = 2
			}

			this._prevRPhase = R.phase
		}
	}

	getHUDInfo() {
		const { P, R } = this.getPR()
		return {
			lane: this.playerLane,
			P,
			R,
			pStage: this.pStage,
			rStage: this.rStage,
			haiUntilMs: this.haiUntilMs,
		}
	}
}

function normalize0to2pi(a) {
	let x = a
	while (x < 0) x += 2 * Math.PI
	while (x >= 2 * Math.PI) x -= 2 * Math.PI
	return x
}

function crossedAngle(prev, now, target) {
	const a = wrapToPi(prev - target)
	const b = wrapToPi(now - target)
	return (a > 0 && b <= 0) || (a < 0 && b >= 0) || Math.abs(b) < 0.2
}

function wrapToPi(x) {
	let a = x
	while (a > Math.PI) a -= 2 * Math.PI
	while (a < -Math.PI) a += 2 * Math.PI
	return a
}
