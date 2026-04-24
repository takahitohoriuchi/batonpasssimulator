export class Runner {
	constructor({
		id,
		lane,
		leg,
		s,
		phase = 0.0,
		l = 0.8,
		isRunning = true,
		dist = 0.0,
		runDistance = 0.0,
		omegaScale = 1.0,
		strideScale = 1.0,
		startTriggerOffset = 0.0,
	}) {
		this.id = id
		this.lane = lane
		this.leg = leg

		this.s = s
		this.phase = phase // 0..2π
		this.l = l

		this.dist = dist
		this.prevDist = dist
		this.runDistance = runDistance
		this.raceDistance = 400.0
		this.omegaScale = omegaScale
		this.strideScale = strideScale
		this.startTriggerOffset = startTriggerOffset

		this.individualOmegaComponent = 0.0
		this.interpersonalOmegaComponent = 0.0
		this.syncPartnerCount = 0
		this.omega = 0.0

		this.individualStrideComponent = 0.0
		this.interpersonalStrideFactor = 1.0
		this.stride = 0.0

		this.tauToReceiver = null
		this.prevTauToReceiver = null
		this.tauToZoneEnd = null
		this.tauToReceiverRate = null
		this.waitCueActive = false
		this.waitCueUntilMs = 0
		this.receiverBrakeActive = false
		this.receiverBrakeStrideFactor = 1.0

		this._is_running = isRunning

		this._is_raised_arm = false
		this._is_receive_ready = false
		this._is_offer_pose = false
		this._is_passing = false

		this.armReachExtra = 0.2

		this.refreshKinematics()
	}

	get pitch() {
		return omegaToPitchHz(this.omega)
	}

	get frequency() {
		return omegaToFrequencyHz(this.omega)
	}

	go() {
		this._is_running = true
	}

	stop() {
		this._is_running = false
	}

	speed() {
		return (this.omega / Math.PI) * this.stride
	}

	reach() {
		return this.l + this.armReachExtra
	}

	poseStrideFactor() {
		return this._is_receive_ready || this._is_offer_pose ? 0.9 : 1.0
	}

	refreshKinematics({
		interpersonalOmegaComponent = this.interpersonalOmegaComponent,
		interpersonalStrideFactor = this.interpersonalStrideFactor,
		syncPartnerCount = this.syncPartnerCount,
	} = {}) {
		this.individualOmegaComponent = individualOmegaComponentByRunDistance(this.runDistance)
		this.interpersonalOmegaComponent = interpersonalOmegaComponent
		this.syncPartnerCount = syncPartnerCount
		this.omega = this.omegaScale * (this.individualOmegaComponent + this.interpersonalOmegaComponent)

		const baseStride = individualStrideBaseComponentByRunDistance(this.runDistance)
		this.individualStrideComponent = baseStride * this.poseStrideFactor()
		this.interpersonalStrideFactor = interpersonalStrideFactor
		this.stride = this.strideScale * this.individualStrideComponent * this.interpersonalStrideFactor
	}

	enterReceiveReady() {
		if (this._is_receive_ready) return
		this._is_receive_ready = true
		this._is_raised_arm = true
		this.phase = (3 * Math.PI) / 2 // ★ 1.5π
	}

	exitReceiveReady() {
		this._is_receive_ready = false
		this._is_raised_arm = false
	}

	resetReceiverBrake() {
		this.receiverBrakeActive = false
		this.receiverBrakeStrideFactor = 1.0
	}

	enterOfferPose() {
		if (this._is_offer_pose) return
		this._is_offer_pose = true
		this._is_passing = true
		// phaseはその瞬間で固定
	}

	exitOfferPose() {
		this._is_offer_pose = false
		this._is_passing = false
	}

	phaseUpdate(dtBase, playerSpeed) {
		if (this._is_receive_ready) {
			this.phase = (3 * Math.PI) / 2
			return
		}

		if (this._is_offer_pose) {
			return
		}

		const dphi = playerSpeed * this.omega * dtBase
		this.phase += dphi

		// ★ 2πで0に戻す
		while (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI
		while (this.phase < 0) this.phase += 2 * Math.PI
	}

	step(dtBase, track, playerSpeed) {
		if (!this._is_running) return

		this.phaseUpdate(dtBase, playerSpeed)

		const v = this.speed()
		const ds = v * dtBase * playerSpeed

		const P = track.lapLengthLaneCenter(this.lane)
		this.s = (this.s - ds) % P
		if (this.s < 0) this.s += P
		this.runDistance += ds
	}
}

function pitchHzToOmega(pitchHz) {
	return Math.PI * pitchHz
}

function omegaToPitchHz(omega) {
	return omega / Math.PI
}

function omegaToFrequencyHz(omega) {
	return omega / (2 * Math.PI)
}

function normalizeCurveDistance(runDistance) {
	// 0-10m の個別モデルが未定義なので、いったん 10m の値を使う
	return Math.max(10.0, runDistance)
}

function individualOmegaComponentByRunDistance(runDistance) {
	return pitchHzToOmega(individualPitchHzComponentByRunDistance(runDistance))
}

function individualPitchHzComponentByRunDistance(runDistance) {
	const d = normalizeCurveDistance(runDistance)

	if (d < 20) {
		return -0.0002794207 * (d - 10) ** 3 + 0.1006226551 * (d - 10) + 3.90125
	} else if (20 <= d && d < 30) {
		return 0.0003621035 * (d - 20) ** 3 - 0.0083826212 * (d - 20) ** 2 + 0.0167964429 * (d - 20) + 4.6333333333
	} else if (30 <= d && d < 40) {
		return -0.0000439934 * (d - 30) ** 3 + 0.0024804846 * (d - 30) ** 2 - 0.0422259235 * (d - 30) + 4.37875
	} else if (40 <= d && d < 50) {
		return -0.0000461299 * (d - 40) ** 3 + 0.0011606826 * (d - 40) ** 2 - 0.0454242379 * (d - 40) + 4.52
	} else if (50 <= d && d < 60) {
		return -0.0000277369 * (d - 50) ** 3 - 0.0002232149 * (d - 50) ** 2 - 0.0360495614 * (d - 50) + 4.67125
	} else if (60 <= d && d < 70) {
		return 0.0000083276 * (d - 60) ** 3 - 0.0010553228 * (d - 60) ** 2 - 0.0488349386 * (d - 60) + 4.79625
	} else if (70 <= d && d < 80) {
		return 0.0000444264 * (d - 70) ** 3 - 0.0008054939 * (d - 70) ** 2 - 0.0674431052 * (d - 70) + 4.70875
	} else if (80 <= d && d < 90) {
		return -0.0000072833 * (d - 80) ** 3 + 0.0005272984 * (d - 80) ** 2 - 0.0702250603 * (d - 80) + 4.445
	} else if (90 <= d && d <= 100) {
		return -0.0000102933 * (d - 90) ** 3 + 0.0003088004 * (d - 90) ** 2 - 0.0613640702 * (d - 90) + 4.45
	}

	return 4.2 + 0.25 * Math.exp(-0.2331042088 * (d - 100))
}

function individualStrideBaseComponentByRunDistance(runDistance) {
	const d = normalizeCurveDistance(runDistance)

	if (d < 20) {
		return -0.0000048752 * (d - 10) ** 3 + 0.0627370948 * (d - 10) + 1.3675
	} else if (20 <= d && d < 30) {
		return -0.0000743742 * (d - 20) ** 3 - 0.0001462551 * (d - 20) ** 2 + 0.0612745438 * (d - 20) + 1.91625
	} else if (30 <= d && d < 40) {
		return 0.0000723718 * (d - 30) ** 3 - 0.0023774797 * (d - 30) ** 2 + 0.0360361899 * (d - 30) + 2.36625
	} else if (40 <= d && d < 50) {
		return -0.000016363 * (d - 40) ** 3 - 0.0002063263 * (d - 40) ** 2 + 0.0101981341 * (d - 40) + 2.4875
	} else if (50 <= d && d < 60) {
		return 0.0000493301 * (d - 50) ** 3 - 0.0006972151 * (d - 50) ** 2 - 0.0108372801 * (d - 50) + 2.47875
	} else if (60 <= d && d < 70) {
		return 0.0000100426 * (d - 60) ** 3 + 0.0007826883 * (d - 60) ** 2 - 0.0099825484 * (d - 60) + 2.39625
	} else if (70 <= d && d < 80) {
		return -0.0000363758 * (d - 70) ** 3 + 0.0010839666 * (d - 70) ** 2 + 0.008679001 * (d - 70) + 2.43125
	} else if (80 <= d && d < 90) {
		return 0.0000327106 * (d - 80) ** 3 - 0.0000073074 * (d - 80) ** 2 + 0.0194455931 * (d - 80) + 2.58625
	} else if (90 <= d && d <= 100) {
		return -0.000032467 * (d - 90) ** 3 + 0.0009739121 * (d - 90) ** 2 + 0.0291116397 * (d - 90) + 2.53375
	}

	return 2.53375
}

function interpersonalOmegaComponentByRunDistance(_runDistance) {
	return 0.0
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
