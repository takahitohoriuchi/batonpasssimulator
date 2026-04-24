export class InteractionController {
	constructor(track) {
		this.track = track
		this.raiseArmLead_m = 8.0 // receiverが近づいたら腕上げ（仮）
	}

	step(sim) {
		let anyPossible = false
		let latestPasserId = null
		let latestReceiverId = null

		for (const baton of sim.batons) {
			const passer = sim.runners.find((r) => r.id === baton.holderId)
			if (!passer) continue

			const receiver = sim.runners.find((r) => r.lane === passer.lane && r.leg === passer.leg + 1)
			if (!receiver) continue

			const zone = sim.zones[passer.leg - 1]
			if (!zone) continue

			const triggerRaceDist = sim.getStartTriggerRaceDist(receiver)
			if (!receiver._is_running && sim.didRunnerCrossRaceDist(passer, triggerRaceDist)) {
				receiver.go()
			}

			const gap = sim.shortestRaceDistanceMeters(passer.dist, receiver.dist)
			const inP = sim.isRunnerInZone(passer, zone)
			const inR = sim.isRunnerInZone(receiver, zone)
			const shouldRaiseArm = receiver._is_running && inP && inR && 0 < gap && gap < this.raiseArmLead_m
			const forcedWaitReady = receiver.receiverBrakeActive

			if (shouldRaiseArm || forcedWaitReady) {
				receiver.enterReceiveReady()
			} else if (receiver._is_receive_ready) {
				receiver.exitReceiveReady()
			}

			const dist = Math.abs(sim.shortestArcDistance(passer, receiver))
			const possible = inP && inR && receiver._is_receive_ready && dist <= receiver.reach()

			passer._is_passing = possible
			receiver._is_passing = possible

			if (!possible) continue

			latestPasserId = passer.id
			latestReceiverId = receiver.id
			anyPossible = true

			passer.enterOfferPose()
			baton.attachTo(receiver)
			passer.stop()
			passer.exitOfferPose()
			receiver.resetReceiverBrake()
			receiver.exitReceiveReady()
			receiver._is_passing = false
		}

		sim.passState = { possible: anyPossible, passerId: latestPasserId, receiverId: latestReceiverId }
	}
}
