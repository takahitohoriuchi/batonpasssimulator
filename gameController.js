export class GameController {
	constructor(sim) {
		this.sim = sim

		this.enabled = true
		this.playerLane = 4

		this._prevPId = null

		// p0:走る / p1:call済 / p2:offer済 / p3:release済
		this.pStage = 0

		// r0:待ち / r1:出走 / r2:もらうポーズ / r3:grasp済
		this.rStage = 0

		this.called = false
		this.haiUntilMs = 0

		this._prevRPhase = null

		this.canOfferNow = false

		this.successMessage = false
	}

	reset() {
		this._prevPId = null
		this.pStage = 0
		this.rStage = 0
		this.called = false
		this.haiUntilMs = 0
		this._prevRPhase = null
		this.canOfferNow = false
		this.successMessage = false
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
		this.canOfferNow = false
		this.successMessage = false
	}

	canOffer(P, R) {
		if (this.rStage !== 2) return false

		const phi = normalize0to2pi(P.phase)
		

		if (!(Math.PI <= phi && phi < 1.5*Math.PI)) return false  

		const dif = Math.abs(this.sim.shortestArcDistance(P, R))
		return dif <= R.l - Math.sin(phi) * P.l
	}

	canGrasp(P, R) {
		if (this.pStage !== 2) return false
		else{return true}	
	}

	call(P, R) {
		if (this.pStage !== 0 || this.rStage !== 1) return
		this.called = true
		this.pStage = 1
		this.haiUntilMs = performance.now() + 500
		this._prevRPhase = R.phase
	}

	offer(P, R) {
		if (this.pStage !== 1 || this.rStage !== 2) return
		P.enterOfferPose()
		this.pStage = 2
		P._is_passing = true
		R._is_passing = true
	}

	grasp(P, R) {
		if (!this.canGrasp(P, R)) return
		this.rStage = 3
	}

	release(P, R) {
		if (this.rStage !== 3) return

		const baton = this.getPlayerBaton()
		if (!baton) return

		this.pStage = 3

		baton.attachTo(R)

		P.stop()
		P._is_passing = false
		R._is_passing = false
		R.exitReceiveReady()

		this.successMessage = true // ★ Success
	}

	checkFailure(P, R) {
		const zone = this.sim.zones[P.leg - 1]
		if (!zone) return null

		if (P.dist >= R.dist) {
			return 'Failure: P caught up with R'
		}

		if (this.pStage < 3 && R.dist > zone.end) {
			return 'Failure: R passed zone end before release'
		}

		return null
	}

	onKeyDown(e) {
		if (this.sim.failureMessage) {
			e.preventDefault()
			this.sim.resetRace()
			return
		}

		if (!this.enabled) return
		if (e.repeat) return

		const { P, R } = this.getPR()
		if (!P || !R) return

		this._resetOnPSwitch(P.id)

		if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
			e.preventDefault()

			if (this.rStage === 0) {
				R.go()
				this.rStage = 1
				return
			}

			if (this.rStage === 2) {
				if (this.canGrasp(P, R)) {
					this.grasp(P, R)
				}
				return
			}
		}

		if (e.code === 'Enter') {
			e.preventDefault()

			if (this.pStage === 0) {
				this.call(P, R)
				return
			}

			if (this.pStage === 2) {
				this.release(P, R)
				return
			}
		}
	}

	step() {
		if (!this.enabled) return

		const { P, R } = this.getPR()
		if (!P || !R) return

		this._resetOnPSwitch(P.id)

		// ★ call後、Rが 3π/2 を跨いだ瞬間にもらうポーズ
		if (this.called && this.rStage === 1) {
			const target = (3 * Math.PI) / 2

			if (this._prevRPhase == null) this._prevRPhase = R.phase

			if (crossedAngle0to2pi(this._prevRPhase, R.phase, target)) {
				R.enterReceiveReady()
				this.rStage = 2
			}

			this._prevRPhase = R.phase
		}

		this.canOfferNow = this.canOffer(P, R)

		if (this.pStage === 1 && this.canOfferNow) {
			this.offer(P, R)
		}

		const failure = this.checkFailure(P, R)
		if (failure) {
			this.sim.player.paused = true
			this.sim.failureMessage = failure
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
			pStageLabel: pStageLabel(this.pStage),
			rStageLabel: rStageLabel(this.rStage),
			haiUntilMs: this.haiUntilMs,
			canOfferNow: this.canOfferNow,
			successMessage: this.successMessage,
		}
	}
}

function pStageLabel(n) {
	return ['走っている', '声かけ済', '差し出し済', '手放し済'][n] ?? '?'
}

function rStageLabel(n) {
	return ['待ち', '出走済', 'もらうポーズ', '握り済'][n] ?? '?'
}

function normalize0to2pi(a) {
	let x = a
	while (x < 0) x += 2 * Math.PI
	while (x >= 2 * Math.PI) x -= 2 * Math.PI
	return x
}

// ★ 0..2π 版の跨ぎ判定
function crossedAngle0to2pi(prev, now, target) {
	const p = normalize0to2pi(prev)
	const n = normalize0to2pi(now)
	const t = normalize0to2pi(target)

	if (Math.abs(n - t) < 0.2) return true

	// ふつうに跨ぐ
	if (p <= t && t <= n && n >= p) return true

	// 2π→0 をまたぐ
	if (n < p) {
		if (t >= p || t <= n) return true
	}

	return false
}
