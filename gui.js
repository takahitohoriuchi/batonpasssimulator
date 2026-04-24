// cameraApi: { overview(), zoomZone12(), zoomZone23(), zoomZone34() }
// rebuildGui: () => void  （召喚後にGUIを作り直すため）
export function buildGUI(sim, cameraApi, cameraState, hudState, rebuildGui) {
	const gui = new lil.GUI()
	const foldersToClose = []

	// ===== カメラ切り替え =====
	const cam = gui.addFolder('Camera')
	foldersToClose.push(cam)
	cam.add(cameraApi, 'overview').name('Overview')
	cam.add(cameraApi, 'zoomZone12').name('Zoom: 1-2 zone')
	cam.add(cameraApi, 'zoomZone23').name('Zoom: 2-3 zone')
	cam.add(cameraApi, 'zoomZone34').name('Zoom: 3-4 zone')
	cam.add(cameraState, 'followBaton').name('Follow Baton')
	cam.add(cameraState, 'followZoom', 1.0, 6.0, 0.1).name('Follow Zoom')

	const display = gui.addFolder('Display')
	foldersToClose.push(display)
	display.add(hudState, 'showHUD').name('Show HUD')

	// ===== 再生設定（speedのみ）=====
	const play = gui.addFolder('Playback')
	foldersToClose.push(play)
	play.add(sim.player, 'speed', 0.1, 1.0, 0.1).name('Speed (x0.1-1.0)')
	play
		.add(
			{
				restartRace: () => {
					sim.resetRace()
				},
			},
			'restartRace',
		)
		.name('Restart Race (R)')

	// ===== ゲーム設定 =====
	const gameFolder = gui.addFolder('Game')
	foldersToClose.push(gameFolder)

	const gameUI = {
		enabled: sim.game?.enabled ?? true,
		team: 'D', // A-H
	}

	gameFolder
		.add(gameUI, 'enabled')
		.name('Enable Game')
		.onChange((v) => {
			sim.game.enabled = v
			rebuildGui()
		})

	// ===== Runner Summon =====
	const summon = {
		A: false,
		B: false,
		C: false,
		D: false,
		E: false,
		F: false,
		G: false,
		H: false,
		seg12: true,
		seg23: false,
		seg34: false,
		all: false,

		summonRunners: () => {
			const lanes = []
			if (summon.A) lanes.push(1)
			if (summon.B) lanes.push(2)
			if (summon.C) lanes.push(3)
			if (summon.D) lanes.push(4)
			if (summon.E) lanes.push(5)
			if (summon.F) lanes.push(6)
			if (summon.G) lanes.push(7)
			if (summon.H) lanes.push(8)
			if (lanes.length === 0) return

			const segments = []
			if (summon.all) segments.push('all')
			else {
				if (summon.seg12) segments.push('12')
				if (summon.seg23) segments.push('23')
				if (summon.seg34) segments.push('34')
			}
			if (segments.length === 0) segments.push('12')

			sim.summon({ lanes, segments })

			// 見失い防止
			cameraApi.overview()

			// ★ 召喚結果に合わせてGUIを更新（runnerごとのparams UIを作り直す）
			rebuildGui()
		},
	}

	const summonFolder = gui.addFolder('Summon')
	foldersToClose.push(summonFolder)
	const teamFolder = summonFolder.addFolder('Teams (A-H)')
	foldersToClose.push(teamFolder)
	teamFolder
		.add(gameUI, 'team', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
		.name('Player Team')
		.onChange((t) => {
			const lane = 'ABCDEFGH'.indexOf(t) + 1
			sim.game.playerLane = lane
		})
	teamFolder.add(summon, 'A')
	teamFolder.add(summon, 'B')
	teamFolder.add(summon, 'C')
	teamFolder.add(summon, 'D')
	teamFolder.add(summon, 'E')
	teamFolder.add(summon, 'F')
	teamFolder.add(summon, 'G')
	teamFolder.add(summon, 'H')

	const segFolder = summonFolder.addFolder('Segments')
	foldersToClose.push(segFolder)
	segFolder.add(summon, 'seg12').name('1-2')
	segFolder.add(summon, 'seg23').name('2-3')
	segFolder.add(summon, 'seg34').name('3-4')
	segFolder.add(summon, 'all').name('All legs')

	summonFolder.add(summon, 'summonRunners').name('Summon!')

	// ===== Runner Params（ランナーごとに独立）=====
	// 直感的：Laneごと → runner（leg）ごと
	const params = gui.addFolder('Runner Params')
	foldersToClose.push(params)

	// laneでグルーピング
	const byLane = new Map()
	for (const r of sim.runners) {
		if (!byLane.has(r.lane)) byLane.set(r.lane, [])
		byLane.get(r.lane).push(r)
	}

	for (const [lane, runners] of Array.from(byLane.entries()).sort((a, b) => a[0] - b[0])) {
		const lf = params.addFolder(`Lane ${lane}`)
		foldersToClose.push(lf)

		// leg順
		runners.sort((a, b) => a.leg - b.leg)

		for (const r of runners) {
			const rf = lf.addFolder(`Leg ${r.leg}  (${r.id})`)
			foldersToClose.push(rf)

			// ここは「各ランナー独立」編集
			rf.add(r, 'omegaScale', 0.5, 2.0, 0.01)
				.name('pitch coef')
				.onChange(() => sim.refreshAllRunnerKinematics())
			rf.add(r, 'strideScale', 0.5, 2.0, 0.01)
				.name('stride coef')
				.onChange(() => sim.refreshAllRunnerKinematics())
			if (!sim.game?.enabled && r.leg > 1) {
				rf.add(r, 'startTriggerOffset', 0.0, 10.0, 0.1).name('start marker offset (m)')
			}
			rf.add(r, 'l', 0.1, 1.5, 0.01).name('arm length l (m)')
			rf.add(r, 'armReachExtra', 0.0, 0.8, 0.01).name('extra reach (m)')
		}
	}

	const interpersonalFolder = gui.addFolder('Interpersonal')
	foldersToClose.push(interpersonalFolder)
	interpersonalFolder
		.add(sim.interpersonal, 'enabled')
		.name('Enable Interpersonal')
		.onChange(() => {
			sim.refreshAllRunnerKinematics()
			rebuildGui()
		})

	if (sim.interpersonal.enabled) {
		const passerFolder = interpersonalFolder.addFolder('Passer (P)')
		foldersToClose.push(passerFolder)
		passerFolder
			.add(sim.interpersonal.passer, 'syncMode', {
				'Next runner / same team': 'sameTeamNext',
				'Next runners / all teams': 'allNext',
				'All running runners': 'allRunning',
			})
			.name('Partners')
			.onChange(() => sim.refreshAllRunnerKinematics())
		passerFolder
			.add(sim.interpersonal.passer, 'rangeM', 0.0, 400.0, 1.0)
			.name('Range (m)')
			.onChange(() => sim.refreshAllRunnerKinematics())
		passerFolder
			.add(sim.interpersonal.passer, 'K', 0.0, 10.0, 0.01)
			.name('K')
			.onChange(() => sim.refreshAllRunnerKinematics())

		const receiverFolder = interpersonalFolder.addFolder('Receiver (R)')
		foldersToClose.push(receiverFolder)
		receiverFolder
			.add(sim.interpersonal.receiver, 'syncMode', {
				'Prev runner / same team': 'sameTeamPrevious',
				'Prev runners / all teams': 'allPrevious',
				'All running runners': 'allRunning',
			})
			.name('Partners')
			.onChange(() => sim.refreshAllRunnerKinematics())
		receiverFolder
			.add(sim.interpersonal.receiver, 'rangeM', 0.0, 400.0, 1.0)
			.name('Range (m)')
			.onChange(() => sim.refreshAllRunnerKinematics())
		receiverFolder
			.add(sim.interpersonal.receiver, 'K', 0.0, 10.0, 0.01)
			.name('K')
			.onChange(() => sim.refreshAllRunnerKinematics())
	}

	for (const folder of foldersToClose.reverse()) {
		folder.close()
	}

	return gui
}
