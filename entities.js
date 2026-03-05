export class Runner {
	constructor({
		id,
		lane,
		leg,
		s,
		pitch = 5.0,
		stride = 2.0,
		phase = 0.0,
		l = 0.8,
		isRunning = true,
		dist = 0.0, // 0〜400m の走行距離表示用
	}) {
		this.id = id
		this.lane = lane
		this.leg = leg

		this.s = s
		this.pitch = pitch
		this.stride = stride
		this.phase = phase
		this.l = l

		this.dist = dist
		this.raceDistance = 400.0

		this._is_running = isRunning
		this._is_raised_arm = false
		this._is_passing = false

		this.armReachExtra = 0.2
	}

	// ===== 制御 =====
	go() {
		this._is_running = true
	}
	stop() {
		this._is_running = false
	}

	// ===== 運動学 =====
	speed() {
		return this.pitch * this.stride // m/s
	}

	reach() {
		return this.l + this.armReachExtra
	}

	// ===== 位相更新 =====
	phaseUpdate(dtBase, playerSpeed) {
		const dphi = playerSpeed * this.pitch * Math.PI * dtBase

		// 固定（仕様の近似）：特定位相付近では更新しない
		const tol = 0.2
		const near = (a, b) => Math.abs(a - b) < tol

		const targetUp = +Math.PI / 2
		const targetDown = -Math.PI / 2

		if (this.leg === 1 || this.leg === 3) {
			if (this._is_passing && near(this.phase, targetUp)) return
			if (this._is_raised_arm && near(this.phase, targetDown)) return
		} else {
			if (this._is_passing && near(this.phase, targetDown)) return
			if (this._is_raised_arm && near(this.phase, targetUp)) return
		}

		this.phase += dphi

		// wrap to [-π, π]
		while (this.phase > Math.PI) this.phase -= 2 * Math.PI
		while (this.phase < -Math.PI) this.phase += 2 * Math.PI
	}

	step(dtBase, track, playerSpeed) {
		if (!this._is_running) return

		this.phaseUpdate(dtBase, playerSpeed)

		const v = this.speed()
		const ds = v * dtBase * playerSpeed

		// 距離メータ（0→400、400で0に戻す）
		// this.dist = (this.dist + ds) % this.raceDistance

		// 位置更新（左回り＝sを減らす）
		const P = track.lapLengthLaneCenter(this.lane)
		this.s = (this.s - ds) % P
		if (this.s < 0) this.s += P
	}
}

export class Baton {
	constructor({ holderId, lane, s }) {
		this.holderId = holderId
		this.lane = lane
		this.s = s
	}

	attachTo(runner) {
		this.holderId = runner.id
		this.lane = runner.lane
		this.s = runner.s
	}
}
