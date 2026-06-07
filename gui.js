// cameraApi: { overview(), zoomZone12(), zoomZone23(), zoomZone34() }
// rebuildGui: () => void  （召喚後にGUIを作り直すため）
export function buildGUI(sim, cameraApi, cameraState, hudState, rebuildGui) {
	const gui = new lil.GUI()
	const foldersToClose = []
	const addStyledFolder = (parent, title, depth) => {
		const folder = parent.addFolder(title)
		applyFolderDepthStyle(folder, depth)
		foldersToClose.push(folder)
		return folder
	}

	// ===== カメラ切り替え =====
	const cam = addStyledFolder(gui, 'Camera', 0)
	cam.add(cameraApi, 'overview').name('Overview')
	cam.add(cameraApi, 'zoomZone12').name('Zoom: 1-2 zone')
	cam.add(cameraApi, 'zoomZone23').name('Zoom: 2-3 zone')
	cam.add(cameraApi, 'zoomZone34').name('Zoom: 3-4 zone')
	cam.add(cameraState, 'followBaton').name('Follow Baton')
	cam.add(cameraState, 'followZoom', 1.0, 20.0, 0.1).name('Follow Zoom')

	const display = addStyledFolder(gui, 'Display', 0)
	display.add(hudState, 'showHUD').name('Show HUD')
	display.add(sim.visual, 'trailLength', 0, 120, 1).name('Trail length')
	display.add(sim.visual, 'trailFrameStride', 1, 10, 1).name('Trail frame step')

	// ===== 再生設定（speedのみ）=====
	const play = addStyledFolder(gui, 'Playback', 0)
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
	const gameFolder = addStyledFolder(gui, 'Game', 0)

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

	const summonFolder = addStyledFolder(gui, 'Summon', 0)
	const teamFolder = addStyledFolder(summonFolder, 'Teams (A-H)', 1)
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

	const segFolder = addStyledFolder(summonFolder, 'Segments', 1)
	segFolder.add(summon, 'seg12').name('1-2')
	segFolder.add(summon, 'seg23').name('2-3')
	segFolder.add(summon, 'seg34').name('3-4')
	segFolder.add(summon, 'all').name('All legs')

	summonFolder.add(summon, 'summonRunners').name('Summon!')

	// ===== Runner Params（ランナーごとに独立）=====
	// 直感的：Laneごと → runner（leg）ごと
	const params = addStyledFolder(gui, 'Runner Params', 0)

	// laneでグルーピング
	const byLane = new Map()
	for (const r of sim.runners) {
		if (!byLane.has(r.lane)) byLane.set(r.lane, [])
		byLane.get(r.lane).push(r)
	}

	for (const [lane, runners] of Array.from(byLane.entries()).sort((a, b) => a[0] - b[0])) {
		const lf = addStyledFolder(params, `Lane ${lane}`, 1)

		// leg順
		runners.sort((a, b) => a.leg - b.leg)

		for (const r of runners) {
			const rf = addStyledFolder(lf, `Leg ${r.leg}  (${r.id})`, 2)

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

	const interpersonalFolder = addStyledFolder(gui, 'Interpersonal', 0)
	interpersonalFolder
		.add(sim.interpersonal, 'enabled')
		.name('Enable Interpersonal')
		.onChange(() => {
			sim.refreshAllRunnerKinematics()
			rebuildGui()
		})
	interpersonalFolder
		.add(sim.interpersonal, 'waitCueEnabled')
		.name('Enable "Wait!" cue')
		.onChange(() => {
			sim.refreshAllRunnerKinematics()
		})

	if (sim.interpersonal.enabled) {
		const passerFolder = addStyledFolder(interpersonalFolder, 'Passer (P)', 1)
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
		passerFolder
			.add(sim.interpersonal.passer, 'strideRangeM', 5.0, 20.0, 0.1)
			.name('Stride D (m)')
			.onChange(() => sim.refreshAllRunnerKinematics())
		passerFolder
			.add(sim.interpersonal.passer, 'strideM1', 0.0001, 0.02, 0.0001)
			.name('Stride M1')
			.onChange(() => sim.refreshAllRunnerKinematics())

		const receiverFolder = addStyledFolder(interpersonalFolder, 'Receiver (R)', 1)
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
		receiverFolder
			.add(sim.interpersonal.receiver, 'strideM2', 0.0001, 0.02, 0.0001)
			.name('Stride M2')
			.onChange(() => sim.refreshAllRunnerKinematics())
	}

	for (const folder of foldersToClose.reverse()) {
		folder.close()
	}

	return gui
}

function applyFolderDepthStyle(folder, depth) {
	const root = folder.domElement
	if (!root) return

	root.dataset.folderDepth = String(depth)

	const title = root.querySelector(':scope > .title') || root.querySelector('.title')
	if (!title) return

	title.dataset.folderDepth = String(depth)

	let marker = title.querySelector('.folder-marker')
	if (!marker) {
		marker = document.createElement('span')
		marker.className = 'folder-marker'
		title.prepend(marker)
	}

	marker.textContent = depth === 0 ? '◆' : depth === 1 ? '▸' : '•'
}
