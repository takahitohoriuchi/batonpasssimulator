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
		this.prevTauToZoneEnd = null
		this.tauToReceiverRate = null
		this.tauToZoneEndRate = null
		this.waitCueActive = false
		this.waitCueUntilMs = 0
		this.passerStrideInterpersonalFactor = 1.0
		this.receiverBrakeActive = false
		this.receiverStrideInterpersonalFactor = 1.0

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
		// Kuramoto model:
		// dphi/dt = omega_self(runDistance) + omega_interpersonal
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
		if (this._is_receive_ready) return false
		this._is_receive_ready = true
		this._is_raised_arm = true
		this.phase = (3 * Math.PI) / 2 // ★ 1.5π
		return true
	}

	exitReceiveReady() {
		this._is_receive_ready = false
		this._is_raised_arm = false
	}

	resetReceiverBrake() {
		this.receiverBrakeActive = false
		this.receiverStrideInterpersonalFactor = 1.0
		this.prevTauToZoneEnd = null
		this.tauToZoneEndRate = null
	}

	resetPasserStrideInterpersonal() {
		this.passerStrideInterpersonalFactor = 1.0
	}

	enterOfferPose() {
		if (this._is_offer_pose) return false
		this._is_offer_pose = true
		this._is_passing = true
		// phaseはその瞬間で固定
		return true
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

const REPRESENTATIVE_SPLINE_BREAKS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

// Coefficients exported from scipy.interpolate.CubicSpline using the same
// 10 m mean data as fit_representative_stride_curves_spline.py.
const PITCH_SPLINE_COEFFICIENTS = [
	[0.000226533336196, -0.0119710000858811, 0.1836816672392071, 3.90125],
	[0.000226533336196, -0.005175, 0.0122216663803964, 4.767499999999999],
	[-0.0000076666809802, 0.0016210000858811, -0.0233183327607924, 4.598750000000001],
	[-0.0000558666122753, 0.0013909996564755, 0.0068016646627734, 4.52],
	[-0.0000251168699187, -0.0002849987117829, 0.0178616741096989, 4.671250000000001],
	[0.0000075840919501, -0.0010385048093438, 0.0046266388984313, 4.79625],
	[0.0000447805021184, -0.0008109820508417, -0.0138682297034238, 4.746250000000001],
	[-0.0000079561004237, 0.0005324330127104, -0.0166537200847361, 4.571249999999999],
	[-0.0000079561004237, 0.00029375, -0.0083918899576318, 4.45],
]

const STRIDE_SPLINE_COEFFICIENTS = [
	[-0.0000596944778427, 0.00129708433528, 0.0478736044314668, 1.3675],
	[-0.0000596944778427, -0.00049375, 0.0559069477842666, 1.91625],
	[0.0000684723892133, -0.00228458433528, 0.0281236044314668, 2.36625],
	[-0.0000154450790106, -0.0002304126588801, 0.002973634489866, 2.4875],
	[0.0000495579268293, -0.0006937650291996, -0.006268142390931, 2.47875],
	[0.0000059633716936, 0.0007929727756785, -0.0052760649261422, 2.39625],
	[-0.0000871614136036, 0.0009718739264857, 0.0123724020954998, 2.42875],
	[0.0000664322827207, -0.0016429684816214, 0.0056614565441429, 2.5625],
	[0.0000664322827207, 0.00035, -0.0072682282720714, 2.52125],
]

function evaluateRepresentativeSpline(distance, coefficients) {
	const d = normalizeCurveDistance(distance)
	for (let i = 0; i < coefficients.length; i += 1) {
		const start = REPRESENTATIVE_SPLINE_BREAKS[i]
		const end = REPRESENTATIVE_SPLINE_BREAKS[i + 1]
		if (d <= end) {
			const [a, b, c, intercept] = coefficients[i]
			const u = d - start
			return ((a * u + b) * u + c) * u + intercept
		}
	}
	return null
}

function individualOmegaComponentByRunDistance(runDistance) {
	return pitchHzToOmega(individualPitchHzComponentByRunDistance(runDistance))
}

function individualPitchHzComponentByRunDistance(runDistance) {
	const splineValue = evaluateRepresentativeSpline(runDistance, PITCH_SPLINE_COEFFICIENTS)
	if (splineValue !== null) {
		return splineValue
	}

	const d = normalizeCurveDistance(runDistance)
	return 4.2 + 0.25 * Math.exp(-0.233 * (d - 100))
}

function individualStrideBaseComponentByRunDistance(runDistance) {
	const splineValue = evaluateRepresentativeSpline(runDistance, STRIDE_SPLINE_COEFFICIENTS)
	if (splineValue !== null) {
		return splineValue
	}

	return 2.53
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
