export class InteractionController {
	constructor(track) {
		this.track = track
		this.raiseArmLead_m = 8.0 // receiverが近づいたら腕上げ（仮）
	}

	step(sim) {
		// バトン保持者＝passer
		const passer = sim.runners.find((r) => r.id === sim.baton.holderId)
		if (!passer) return

		// 次走者をreceiverとする（同一レーン/同一チーム想定）
		const receiverLeg = passer.leg + 1
		const receiver = sim.runners.find((r) => r.lane === passer.lane && r.leg === receiverLeg)
		if (!receiver) {
			sim.passState = { possible: false, passerId: passer.id, receiverId: null }
			return
		}

		// 対象ゾーン：leg1→zones[0], leg2→zones[1], leg3→zones[2]
		const zi = passer.leg - 1
		const zone = sim.zones[zi]
		if (!zone) return

		// receiver腕上げ（仮）
		const ds = sim.arcDelta(receiver, passer) // receiver - passer
		receiver._is_raised_arm = ds > 0 && ds < this.raiseArmLead_m

		// ゾーン内
		const inP = sim.isInZone(passer, zone)
		const inR = sim.isInZone(receiver, zone)

		// パス可能判定（強調描画のため先に計算）
		const dist = Math.abs(sim.shortestArcDistance(passer, receiver))
		const possible = inP && inR && receiver._is_raised_arm && dist <= receiver.reach()

		sim.passState = { possible, passerId: passer.id, receiverId: receiver.id }

		// ランナー側 state（位相固定用）
		passer._is_passing = possible
		receiver._is_passing = possible

		if (!possible) return

		// 成立：バトン移す
		sim.baton.attachTo(receiver)

		// 受け取り後：腕を下げる（仕様の「戻す」をここで一旦簡易実装）
		receiver._is_raised_arm = false
		passer._is_passing = false
		receiver._is_passing = false
	}
}
