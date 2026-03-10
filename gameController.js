export class GameController {
	constructor(sim) {
		this.sim = sim

		this.enabled = true
		this.playerLane = 4

		this._prevPId = null

		// pStage
		// p0: 走っている
		// p1: 声かけ済
		// p2: 差し出し済
		// p3: 手放し済（完了）
		this.pStage = 0

		// rStage
		// r0: 待ち
		// r1: 出走済
		// r2: もらうポーズ
		// r3: 握り済
		this.rStage = 0

		this.called = false
		this.haiUntilMs = 0

		this._prevRPhase = null

		this.canOfferNow = false
	}

	reset() {
		this._prevPId = null
		this.pStage = 0
		this.rStage = 0
		this.called = false
		this.haiUntilMs = 0
		this._prevRPhase = null
		this.canOfferNow = false
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

		// 旧Rのポーズ解除などは release 側で済んでいる前提
		this._prevPId = newPId

		this.pStage = 0
		this.rStage = 0
		this.called = false
		this.haiUntilMs = 0
		this._prevRPhase = null
		this.canOfferNow = false
	}

	// ---------- 条件 ----------
	canOffer(P, R) {
		// rStage == 2
		if (this.rStage !== 2) return false

		const phi = normalize0to2pi(P.phase)

		// 0 <= φ <= π
		if (!(0 <= phi && phi <= Math.PI)) return false

		// sin増加フェーズ = cos>0
		if (Math.cos(phi) <= 0) return false

		// 距離条件
		const dif = Math.abs(this.sim.shortestArcDistance(P, R))
		return dif - R.l <= Math.sin(phi) * P.l
	}

	canGrasp(P, R) {
		// P差し出し済
		if (this.pStage !== 2) return false

		// 距離条件
		const dif = Math.abs(this.sim.shortestArcDistance(P, R))
		return dif <= P.l + R.l
	}

	// ---------- イベント ----------
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
		// release条件：Rがgrasp済
		if (this.rStage !== 3) return

		const baton = this.getPlayerBaton()
		if (!baton) return

		this.pStage = 3

		// バトンをRへ
		baton.attachTo(R)

		// Pはその場で停止
		P.stop()

		// Rはポーズ解除して次のPになる
		R.exitReceiveReady()

		// 旧Pの offer pose 解除はしない（その場で固まる）
		P._is_passing = false
		R._is_passing = false

		// 次フレームに _resetOnPSwitch で新しいP/Rへ切替
	}

	// ---------- 失格 ----------
	checkFailure(P, R) {
		const zone = this.sim.zones[P.leg - 1]
		if (!zone) return null

		// 1) PがRに追いついた
		if (P.dist >= R.dist) {
			return 'Failure: P caught up with R'
		}

		// 2) Pがreleaseする前にRがゾーン終端を超えた
		if (this.pStage < 3 && R.dist > zone.end) {
			return 'Failure: R passed zone end before release'
		}

		// 3) Rがgrasp後、次の振り上げ前までにreleaseしなかった
		// ※現在仕様では receiveReady 中は位相固定なので、実質トリガしにくい。
		// 　将来、grasp後に位相再開する設計へ変えたときにここを有効化する。
		return null
	}

	// ---------- 入力 ----------
	onKeyDown(e) {
		// Failure中は何かキーを押したらリセット
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

		// Control = R操作
		if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
			e.preventDefault()

			// r0 -> r1 : go
			if (this.rStage === 0) {
				R.go()
				this.rStage = 1
				return
			}

			// r2 -> r3 : grasp（条件成立時のみ）
			if (this.rStage === 2) {
				if (this.canGrasp(P, R)) {
					this.grasp(P, R)
				}
				return
			}
		}

		// Enter = P操作
		if (e.code === 'Enter') {
			e.preventDefault()

			// p0 -> p1 : call
			if (this.pStage === 0) {
				this.call(P, R)
				return
			}

			// p2 -> p3 : release
			if (this.pStage === 2) {
				this.release(P, R)
				return
			}
		}
	}

	// ---------- 毎フレーム ----------
	step() {
		if (!this.enabled) return

		const { P, R } = this.getPR()
		if (!P || !R) return

		this._resetOnPSwitch(P.id)

		// call後、R位相が -π/2 になった瞬間に receiveReady
		if (this.called && this.rStage === 1) {
			const target = -Math.PI / 2

			if (this._prevRPhase == null) this._prevRPhase = R.phase

			if (crossedAngle(this._prevRPhase, R.phase, target)) {
				R.enterReceiveReady()
				this.rStage = 2
			}

			this._prevRPhase = R.phase
		}

		// canOffer の間はピンク強調
		this.canOfferNow = this.canOffer(P, R)

		// canOffer を満たした瞬間、自動で offer
		if (this.pStage === 1 && this.canOfferNow) {
			this.offer(P, R)
		}

		// 失格判定
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
