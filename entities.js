export class Runner {
	constructor({ id, lane, leg, s, pitch = 5.0, stride = 2.0, phase = 0.0, l = 0.8, isRunning = true, dist = 0.0 }) {
		this.id = id
		this.lane = lane
		this.leg = leg

		this.s = s
		this.pitch = pitch
		this.stride = stride
		this.baseStride = stride
		this.phase = phase
		this.l = l

		this.dist = dist
		this.raceDistance = 400.0

		this._is_running = isRunning

		this._is_raised_arm = false
		this._is_receive_ready = false
		this._is_offer_pose = false
		this._is_passing = false

		this.armReachExtra = 0.2
	}

	go() {
		this._is_running = true
	}

	stop() {
		this._is_running = false
	}

	speed() {
		return this.pitch * this.stride
	}

	reach() {
		return this.l + this.armReachExtra
	}

	// もらうポーズ
	enterReceiveReady() {
		if (this._is_receive_ready) return
		this._is_receive_ready = true
		this._is_raised_arm = true
		this.phase = -Math.PI / 2 // 1.5π相当
		this.stride = this.baseStride * 0.9
	}

	exitReceiveReady() {
		this._is_receive_ready = false
		this._is_raised_arm = false
		this.stride = this.baseStride
	}

	// 差し出しポーズ
	enterOfferPose() {
		if (this._is_offer_pose) return
		this._is_offer_pose = true
		this._is_passing = true
		this.stride = this.baseStride * 0.9
		// phase はその瞬間で固定
	}

	exitOfferPose() {
		this._is_offer_pose = false
		this._is_passing = false
		this.stride = this.baseStride
	}

	phaseUpdate(dtBase, playerSpeed) {
		// receiveReady中は固定
		if (this._is_receive_ready) {
			this.phase = -Math.PI / 2
			return
		}

		// offer中は固定
		if (this._is_offer_pose) {
			return
		}

		const dphi = playerSpeed * this.pitch * Math.PI * dtBase
		this.phase += dphi

		while (this.phase > Math.PI) this.phase -= 2 * Math.PI
		while (this.phase < -Math.PI) this.phase += 2 * Math.PI
	}

	step(dtBase, track, playerSpeed) {
		if (!this._is_running) return

		this.phaseUpdate(dtBase, playerSpeed)

		const v = this.speed()
		const ds = v * dtBase * playerSpeed

		const P = track.lapLengthLaneCenter(this.lane)
		this.s = (this.s - ds) % P
		if (this.s < 0) this.s += P
	}
}

export class Baton {
	constructor({ lane, holderId, s }) {
		this.lane = lane
		this.holderId = holderId
		this.s = s
	}

	attachTo(runner) {
		this.holderId = runner.id
		this.lane = runner.lane
		this.s = runner.s
	}
}
