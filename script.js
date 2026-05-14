/* Flexi OSSD Challenge - Phase 2 game engine */
(function () {
	"use strict";

	const app = document.getElementById("app");
	const GRADE_CATALOG = Array.isArray(window.FLEXI_GRADE_CATALOG) ? window.FLEXI_GRADE_CATALOG : [];

	const STORAGE_KEYS = {
		lastSetup: "flexi:v2:lastSetup",
		leaderboard: "flexi:v2:leaderboard"
	};

	const MASCOTS = {
		teaching: "img/flexi_teaching.png",
		thinking: "img/flexi_thinking.png",
		happy: "img/flexi_happy.png",
		sad: "img/flexi_sad.png",
		clap: "img/flexi_clap.png"
	};

	function freshState() {
		const setup = readLastSetup();
		return {
			route: "home",
			playerName: setup.name || "",
			mode: setup.mode || "challenge",
			startGrade: setup.startGrade || 1,
			currentGrade: setup.startGrade || 1,
			currentQuestion: 0,
			currentAttempts: 0,
			phase: "question",
			startedAt: 0,
			finishedAt: 0,
			score: 0,
			firstTry: 0,
			currentStreak: 0,
			bestStreak: 0,
			wrongAttempts: 0,
			answerLog: [],
			missedQuestions: [],
			completedGrades: [],
			selfieDataUrl: null,
			cameraStatus: "idle",
			cameraError: "",
			feedback: null,
			gradeComplete: null,
			leaderboardEntryId: null
		};
	}

	let state = freshState();
	let timerId = null;
	let cameraStream = null;

	app.addEventListener("submit", handleSubmit);
	app.addEventListener("click", handleClick);
	window.addEventListener("hashchange", syncRoute);
	window.addEventListener("load", syncRoute);

	function handleSubmit(event) {
		const form = event.target.closest("form");
		if (!form) return;
		event.preventDefault();

		if (form.dataset.form === "start") {
			const data = new FormData(form);
			const name = String(data.get("name") || "").trim();
			const startGrade = Number(data.get("startGrade"));
			const mode = String(data.get("mode") || "challenge");

			if (!name || !gradeById(startGrade)) return;
			startRun({ name, startGrade, mode });
			return;
		}

		if (form.dataset.form === "answer") {
			checkAnswer(form);
		}
	}

	function handleClick(event) {
		const actionTarget = event.target.closest("[data-action]");
		if (!actionTarget) return;

		switch (actionTarget.dataset.action) {
			case "leaderboard":
				navigate("leaderboard");
				break;
			case "home":
				stopClock();
				state = freshState();
				navigate("home");
				break;
			case "quit-run":
				stopClock();
				state = freshState();
				navigate("home");
				break;
			case "continue":
				continueAfterCorrect();
				break;
			case "advance-grade":
				advanceFromGradeComplete();
				break;
			case "admin-pass-grade":
				adminPassGrade();
				break;
			case "restart-run":
				startRun({
					name: state.playerName,
					startGrade: state.startGrade,
					mode: state.mode
				});
				break;
			case "view-certificate":
				navigate("certificate");
				break;
			case "back-reward":
				stopCertificateCamera();
				navigate("reward");
				break;
			case "capture-selfie":
				captureSelfie();
				break;
			case "retake-selfie":
				retakeSelfie();
				break;
			case "print-certificate":
				if (!state.selfieDataUrl) {
					state.cameraError = "Capture a selfie before printing.";
					render();
					break;
				}
				window.print();
				break;
			case "clear-leaderboard":
				if (window.confirm("Clear all leaderboard entries?")) {
					localStorage.removeItem(STORAGE_KEYS.leaderboard);
					render();
				}
				break;
		}
	}

	function startRun(setup) {
		saveLastSetup(setup);
		state = {
			...freshState(),
			playerName: setup.name,
			mode: setup.mode,
			startGrade: setup.startGrade,
			currentGrade: setup.startGrade,
			startedAt: Date.now()
		};
		startClock();
		navigate("game");
		render();
	}

	function checkAnswer(form) {
		if (state.phase !== "question") return;
		if (state.feedback && state.feedback.correct) return;

		const question = currentQuestion();
		const result = evaluateAnswer(question, form);

		if (!result.answered) {
			state.feedback = {
				correct: false,
				title: "Answer needed",
				body: result.message,
				points: 0
			};
			render();
			return;
		}

		if (result.correct) {
			handleCorrectAnswer(question);
		} else {
			handleWrongAnswer(result.message);
		}

		render();
	}

	function handleCorrectAnswer(question) {
		const wasFirstTry = state.currentAttempts === 0;
		const basePoints = Math.max(1, 3 - state.currentAttempts);
		let streakBonus = 0;

		if (wasFirstTry) {
			state.firstTry += 1;
			state.currentStreak += 1;
			state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
			streakBonus = state.currentStreak >= 3 ? 1 : 0;
		} else {
			state.currentStreak = 0;
			state.missedQuestions.push(buildMissedEntry(question, state.currentAttempts + 1));
		}

		const points = basePoints + streakBonus;
		state.score += points;
		state.answerLog.push({
			grade: state.currentGrade,
			questionId: question.id,
			subject: question.subject,
			prompt: question.prompt,
			firstTry: wasFirstTry,
			attempts: state.currentAttempts + 1,
			basePoints,
			streakBonus,
			points
		});

		state.feedback = {
			correct: true,
			title: wasFirstTry ? "First try" : "Correct",
			body: streakBonus ? `${question.explanation} Streak bonus added.` : question.explanation,
			points
		};
	}

	function handleWrongAnswer(message) {
		state.currentAttempts += 1;
		state.wrongAttempts += 1;
		state.currentStreak = 0;
		state.feedback = {
			correct: false,
			title: state.currentAttempts === 1 ? "Try again" : "Think it through",
			body: message || "That answer is not right yet.",
			points: 0
		};
	}

	function continueAfterCorrect() {
		if (!state.feedback || !state.feedback.correct) return;

		const grade = currentGrade();
		if (state.currentQuestion < grade.questions.length - 1) {
			state.currentQuestion += 1;
			state.currentAttempts = 0;
			state.feedback = null;
			render();
			return;
		}

		completeGrade(grade.id);
	}

	function adminPassGrade() {
		if (!state.startedAt || state.finishedAt || state.phase === "gradeComplete") return;

		const grade = currentGrade();
		grade.questions.forEach((question, index) => {
			const alreadyLogged = state.answerLog.some((item) => item.questionId === question.id);
			if (alreadyLogged || index < state.currentQuestion) return;

			state.answerLog.push({
				grade: grade.id,
				questionId: question.id,
				subject: question.subject,
				prompt: question.prompt,
				firstTry: false,
				attempts: 0,
				basePoints: 0,
				streakBonus: 0,
				points: 0,
				adminSkipped: true
			});
		});

		state.currentStreak = 0;
		state.currentAttempts = 0;
		state.feedback = null;
		completeGrade(grade.id);
	}

	function completeGrade(gradeId) {
		if (!state.completedGrades.includes(gradeId)) {
			state.completedGrades.push(gradeId);
		}

		state.phase = "gradeComplete";
		state.gradeComplete = {
			gradeId,
			finishedRun: state.mode === "practice" || gradeId >= 12
		};
		state.feedback = null;
		render();
	}

	function advanceFromGradeComplete() {
		if (!state.gradeComplete) return;

		const gradeId = state.gradeComplete.gradeId;
		const finishedRun = state.gradeComplete.finishedRun;

		if (finishedRun) {
			finishRun();
			return;
		}

		state.currentGrade = gradeId + 1;
		state.currentQuestion = 0;
		state.currentAttempts = 0;
		state.phase = "question";
		state.gradeComplete = null;
		state.feedback = null;
		render();
	}

	function finishRun() {
		if (!state.finishedAt) {
			state.finishedAt = Date.now();
			stopClock();
			const entry = buildLeaderboardEntry();
			state.leaderboardEntryId = entry.id;
			writeLeaderboard([entry, ...readLeaderboard()]);
		}
		navigate("reward");
		render();
	}

	function evaluateAnswer(question, form) {
		if (question.type === "choice") {
			const selected = form.querySelector("input[name='choice']:checked");
			if (!selected) {
				return { answered: false, correct: false, message: "Pick one option before checking." };
			}
			return {
				answered: true,
				correct: Number(selected.value) === question.answer,
				message: "Compare the option with the exact wording of the prompt."
			};
		}

		if (question.type === "fill") {
			const answer = normalize(form.elements.answer.value);
			if (!answer) {
				return { answered: false, correct: false, message: "Type an answer before checking." };
			}
			return {
				answered: true,
				correct: question.answers.some((expected) => normalize(expected) === answer),
				message: "Check the spelling, number, or tense."
			};
		}

		if (question.type === "match") {
			const values = question.pairs.map((_, index) => normalize(form.elements[`match-${index}`].value));
			if (values.some((value) => !value)) {
				return { answered: false, correct: false, message: "Complete every match before checking." };
			}
			const correct = question.pairs.every((pair, index) => normalize(pair.answer) === values[index]);
			return {
				answered: true,
				correct,
				message: "Review each pair and look for the strongest match."
			};
		}

		return { answered: false, correct: false, message: "This question type is not ready yet." };
	}

	function syncRoute() {
		const nextRoute = getRoute();

		if (nextRoute === "game" && !state.startedAt) {
			navigate("home");
			return;
		}

		if ((nextRoute === "reward" || nextRoute === "certificate" || nextRoute === "results") && !state.finishedAt) {
			navigate("home");
			return;
		}

		state.route = nextRoute === "results" ? "reward" : nextRoute;
		render();
	}

	function render() {
		if (!GRADE_CATALOG.length) {
			app.innerHTML = renderFatalError();
			return;
		}

		const route = state.route || getRoute();

		if (route === "game") {
			stopCertificateCamera();
			app.innerHTML = renderGame();
			updateTimerDisplay();
			return;
		}

		if (route === "reward" || route === "results") {
			stopCertificateCamera();
			app.innerHTML = renderReward();
			return;
		}

		if (route === "certificate") {
			app.innerHTML = renderCertificate();
			startCertificateCamera();
			return;
		}

		if (route === "leaderboard") {
			stopCertificateCamera();
			app.innerHTML = renderLeaderboard();
			return;
		}

		stopCertificateCamera();
		app.innerHTML = renderHome();
	}

	function renderHome() {
		return `
			<section class="screen home-screen">
				<div class="home-inner">
					<div class="home-copy">
						<div class="brand-row">
							<img class="logo" src="img/logo.png" alt="Flexi Academy" />
							<div>
								<p class="brand-kicker">Flexi Academy</p>
								<p class="brand-title">OSSD Challenge</p>
							</div>
						</div>
						<h1>Build your path from Grade 1 to OSSD.</h1>
						<p>Start from any grade, answer focused skill checks, and keep moving until the final launch.</p>
						<div class="mode-summary" aria-label="Challenge summary">
							<div class="metric"><strong>${GRADE_CATALOG.length}</strong><span>grade stops</span></div>
							<div class="metric"><strong>${supportedQuestionTypes().length}</strong><span>question styles</span></div>
							<div class="metric"><strong>${totalCatalogQuestions()}</strong><span>starter prompts</span></div>
						</div>
					</div>

					<form class="start-panel" data-form="start" autocomplete="off">
						<div class="mascot-hero">
							<img src="${MASCOTS.teaching}" alt="Flexi mascot" />
							<div>
								<h2>Start Challenge</h2>
								<p>Your setup is saved locally on this device.</p>
							</div>
						</div>

						<label class="field">
							<span>Student name</span>
							<input name="name" type="text" value="${escapeAttr(state.playerName)}" placeholder="Type a name" required />
						</label>

						<label class="field">
							<span>Starting grade</span>
							<select name="startGrade" required>
								${GRADE_CATALOG.map((grade) => `<option value="${grade.id}" ${grade.id === state.startGrade ? "selected" : ""}>Grade ${grade.id} - ${escapeHtml(grade.title)}</option>`).join("")}
							</select>
						</label>

						<div class="form-label">Mode</div>
						<div class="mode-control">
							<label class="mode-choice">
								<input type="radio" name="mode" value="challenge" ${state.mode === "challenge" ? "checked" : ""} />
								<strong>Fast Track</strong>
								<span>Timed run from the selected grade to Grade 12.</span>
							</label>
							<label class="mode-choice">
								<input type="radio" name="mode" value="practice" ${state.mode === "practice" ? "checked" : ""} />
								<strong>Normal Track</strong>
								<span>One grade, no pressure, same scoring model.</span>
							</label>
						</div>

						<div class="actions">
							<button class="btn primary" type="submit">Start</button>
							<button class="btn ghost" type="button" data-action="leaderboard">Leaderboard</button>
						</div>
					</form>
				</div>
			</section>
		`;
	}

	function renderGame() {
		const grade = currentGrade();
		const progress = questionProgressPercent();
		const panel = state.phase === "gradeComplete" ? renderGradeCompletePanel(grade) : renderQuestionPanel(grade);

		return `
			<section class="screen game-screen">
				${renderTopbar()}
				<div class="game-layout">
					${renderSidePanel()}
					<section class="question-panel" style="--grade-color: ${grade.color}">
						<div class="grade-banner">
							<span class="pill">Grade ${grade.id}</span>
							<h1>${escapeHtml(grade.title)}</h1>
							<p>${escapeHtml(grade.focus)}</p>
						</div>
						<div class="progress-strip">
							<div class="progress-copy">
								<span>${state.phase === "gradeComplete" ? "Grade complete" : `Question ${state.currentQuestion + 1} of ${grade.questions.length}`}</span>
								<span>${answeredCount()} of ${totalQuestionsInRun()} answered</span>
							</div>
							<div class="progress-track" aria-hidden="true">
								<div class="progress-fill" style="--progress: ${progress}%"></div>
							</div>
						</div>
						${panel}
					</section>
				</div>
			</section>
		`;
	}

	function renderTopbar() {
		return `
			<header class="topbar">
				<div class="brand-row">
					<img class="logo" src="img/logo.png" alt="Flexi Academy" />
					<div>
						<p class="brand-kicker">Flexi Academy</p>
						<p class="brand-title">OSSD Challenge</p>
					</div>
				</div>
				<div class="session-meta">
					<span class="pill">${escapeHtml(state.playerName)}</span>
					<span class="pill mode">${modeLabel()}</span>
					<span class="timer" data-timer>${formatDuration(elapsedMs())}</span>
				</div>
				<div class="topbar-actions">
					<button class="btn admin" type="button" data-action="admin-pass-grade" ${state.phase === "gradeComplete" ? "disabled" : ""}>Admin Pass</button>
					<button class="btn ghost" type="button" data-action="quit-run">Exit</button>
				</div>
			</header>
		`;
	}

	function renderSidePanel() {
		const mascot = mascotForState();
		return `
			<aside class="side-panel">
				<div class="mascot-card">
					<img src="${mascot.src}" alt="Flexi mascot" />
					<div class="speech">${escapeHtml(mascot.speech)}</div>
				</div>
				<h2>Journey</h2>
				<p>${journeySummary()}</p>
				<div class="run-stats">
					<div class="score-card"><strong>${state.score}</strong><span>points</span></div>
					<div class="score-card"><strong>${state.bestStreak}</strong><span>best streak</span></div>
				</div>
				<div class="journey-track">
					${GRADE_CATALOG.map(renderJourneyItem).join("")}
				</div>
			</aside>
		`;
	}

	function renderJourneyItem(grade) {
		const inRun = state.mode === "practice" ? grade.id === state.startGrade : grade.id >= state.startGrade;
		const done = state.completedGrades.includes(grade.id);
		const current = grade.id === state.currentGrade;
		const locked = !inRun;
		const stats = gradeStats(grade.id);
		const gradeStatsText = done ? `${stats.points} pts${stats.skipped ? `, ${stats.skipped} skipped` : ""}` : current ? "Now" : locked ? "Locked" : "Queued";
		return `
			<div class="journey-step ${done ? "done" : ""} ${current ? "current" : ""} ${locked ? "locked" : ""}">
				<div class="step-node">${done ? "OK" : grade.id}</div>
				<div class="step-copy">
					<strong>Grade ${grade.id}</strong>
					<span>${escapeHtml(grade.title)}</span>
				</div>
				<div class="step-status">${gradeStatsText}</div>
			</div>
		`;
	}

	function renderQuestionPanel(grade) {
		const question = currentQuestion();
		return `
			<div class="question-body">
				<span class="subject-chip">${escapeHtml(question.subject)}</span>
				<h2 class="question-text">${escapeHtml(question.prompt)}</h2>
				${renderAnswerArea(question)}
			</div>
		`;
	}

	function renderGradeCompletePanel(grade) {
		const stats = gradeStats(grade.id);
		return `
			<div class="grade-complete">
				<div class="grade-seal">OSSD</div>
				<div>
					<span class="subject-chip">Grade Complete</span>
					<h2>${escapeHtml(grade.title)} cleared</h2>
					<p>${gradeCompleteMessage(stats)}</p>
				</div>
				<div class="score-grid">
					<div class="score-card"><strong>${stats.points}</strong><span>grade points</span></div>
					<div class="score-card"><strong>${stats.firstTry}</strong><span>first try</span></div>
					<div class="score-card"><strong>${stats.skipped}</strong><span>admin skipped</span></div>
					<div class="score-card"><strong>${state.bestStreak}</strong><span>best streak</span></div>
				</div>
				<div class="panel-actions">
					<button class="btn primary" type="button" data-action="advance-grade">${gradeCompleteButtonLabel()}</button>
				</div>
			</div>
		`;
	}

	function renderAnswerArea(question) {
		if (state.feedback && state.feedback.correct) {
			return `
				${renderFeedback()}
				<div class="question-actions">
					<button class="btn primary" type="button" data-action="continue">${continueLabel()}</button>
				</div>
			`;
		}

		return `
			${state.feedback ? renderFeedback() : ""}
			<form class="answer-form" data-form="answer">
				${renderQuestionInput(question)}
				<div class="question-actions">
					<button class="btn primary" type="submit">Check Answer</button>
				</div>
			</form>
		`;
	}

	function renderQuestionInput(question) {
		if (question.type === "choice") {
			return `
				<div class="choice-grid">
					${question.options.map((option, index) => `
						<label class="choice-card">
							<input type="radio" name="choice" value="${index}" />
							<span>${escapeHtml(option)}</span>
						</label>
					`).join("")}
				</div>
			`;
		}

		if (question.type === "fill") {
			const inputMode = question.inputMode === "numeric" || question.inputMode === "decimal" ? "decimal" : "text";
			return `
				<label class="field">
					<span>Your answer</span>
					<input class="answer-input" name="answer" type="text" inputmode="${inputMode}" autocomplete="off" placeholder="Type your answer" />
				</label>
			`;
		}

		if (question.type === "match") {
			return `
				<div class="match-grid">
					${question.pairs.map((pair, index) => `
						<label class="match-row">
							<span class="match-prompt">${escapeHtml(pair.label)}</span>
							<select class="match-select" name="match-${index}">
								<option value="">Select match</option>
								${question.choices.map((choiceText) => `<option value="${escapeAttr(choiceText)}">${escapeHtml(choiceText)}</option>`).join("")}
							</select>
						</label>
					`).join("")}
				</div>
			`;
		}

		return `<div class="empty-state">Question renderer missing.</div>`;
	}

	function renderFeedback() {
		const feedback = state.feedback;
		return `
			<div class="feedback ${feedback.correct ? "correct" : "wrong"}">
				<strong>${escapeHtml(feedback.title)}${feedback.points ? ` (+${feedback.points})` : ""}</strong>
				<p>${escapeHtml(feedback.body)}</p>
			</div>
		`;
	}

	function renderReward() {
		const summary = runSummary();
		return `
			<section class="screen reward-screen">
				<div class="confetti-stream" aria-hidden="true">${Array.from({ length: 18 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}</div>
				<div class="result-panel reward-panel">
					<div class="result-header">
						<img src="${MASCOTS.clap}" alt="Flexi clapping" />
						<div>
							<div class="grade-seal">OSSD</div>
							<h1>${escapeHtml(summary.title)}</h1>
							<p>${escapeHtml(summary.message)}</p>
						</div>
					</div>
					<div class="score-grid">
						<div class="score-card"><strong>${state.score}</strong><span>points</span></div>
						<div class="score-card"><strong>${state.completedGrades.length}</strong><span>grades</span></div>
						<div class="score-card"><strong>${state.firstTry}</strong><span>first try</span></div>
						<div class="score-card"><strong>${state.bestStreak}</strong><span>best streak</span></div>
						<div class="score-card"><strong>${state.missedQuestions.length}</strong><span>review items</span></div>
						<div class="score-card"><strong>${totalAdminSkipped()}</strong><span>admin skipped</span></div>
						<div class="score-card"><strong>${formatDuration(elapsedMs())}</strong><span>time</span></div>
					</div>
					${renderReviewSection()}
					<div class="panel-actions">
						<button class="btn accent" type="button" data-action="view-certificate">Certificate</button>
						<button class="btn primary" type="button" data-action="restart-run">Run Again</button>
						<button class="btn ghost" type="button" data-action="leaderboard">Leaderboard</button>
						<button class="btn link" type="button" data-action="home">Home</button>
					</div>
				</div>
			</section>
		`;
	}

	function renderReviewSection() {
		if (!state.missedQuestions.length) {
			return `
				<section class="review-panel success-review">
					<h2>Review</h2>
					<p>No missed prompts in this run.</p>
				</section>
			`;
		}

		return `
			<section class="review-panel">
				<h2>Review These</h2>
				<div class="review-list">
					${state.missedQuestions.map((item) => `
						<article class="review-item">
							<span class="subject-chip">${escapeHtml(item.subject)}</span>
							<h3>Grade ${item.grade}: ${escapeHtml(item.prompt)}</h3>
							<p><strong>Answer:</strong> ${escapeHtml(item.answer)}</p>
							<p>${escapeHtml(item.explanation)}</p>
						</article>
					`).join("")}
				</div>
			</section>
		`;
	}

	function renderCertificate() {
		const summary = runSummary();
		const hasSelfie = Boolean(state.selfieDataUrl);
		return `
			<section class="screen certificate-screen">
				<div class="certificate-sheet">
					<div class="certificate-brand">
						<img src="img/logo.png" alt="Flexi Academy" />
						<div>
							<p class="brand-kicker">Flexi Academy</p>
							<p class="brand-title">OSSD Challenge</p>
						</div>
					</div>
					<div class="certificate-seal">OSSD</div>
					<p class="certificate-kicker">Certificate of Achievement</p>
					<h1>${escapeHtml(state.playerName)}</h1>
					<p class="certificate-copy">has completed ${escapeHtml(summary.gradeLabel)} with ${state.score} points in ${formatDuration(elapsedMs())}.</p>
					<div class="certificate-selfie-wrap">
						<div class="certificate-selfie ${hasSelfie ? "captured" : ""}">
							${hasSelfie
								? `<img src="${state.selfieDataUrl}" alt="${escapeAttr(state.playerName)} selfie" />`
								: `<video id="camera-preview" autoplay playsinline muted></video>`
							}
						</div>
						<div class="selfie-controls no-print">
							<p id="camera-status" class="camera-status ${state.cameraError ? "error" : ""}">${escapeHtml(certificateCameraMessage())}</p>
							<canvas id="photo-canvas" hidden></canvas>
							${hasSelfie
								? `<button class="btn ghost" type="button" data-action="retake-selfie">Retake Selfie</button>`
								: `<button class="btn primary" type="button" data-action="capture-selfie">Capture Selfie</button>`
							}
						</div>
					</div>
					<div class="certificate-meta">
						<div><strong>${state.firstTry}</strong><span>first try</span></div>
						<div><strong>${state.bestStreak}</strong><span>best streak</span></div>
						<div><strong>${todayLabel()}</strong><span>date</span></div>
					</div>
					<div class="certificate-footer">
						<div>
							<strong>Flexi Academy</strong>
							<span>Learning Path Completion</span>
						</div>
						<img src="img/flexi_clap.png" alt="Flexi mascot" />
					</div>
				</div>
				<div class="cert-actions no-print">
					<button class="btn primary" type="button" data-action="print-certificate" ${hasSelfie ? "" : "disabled"}>Print</button>
					<button class="btn ghost" type="button" data-action="back-reward">Back</button>
				</div>
			</section>
		`;
	}

	function startCertificateCamera() {
		if (state.selfieDataUrl) {
			stopCertificateCamera();
			return;
		}

		const video = document.getElementById("camera-preview");
		if (!video) return;

		if (cameraStream) {
			video.srcObject = cameraStream;
			setCameraStatus("Camera ready. Capture a selfie to unlock printing.");
			return;
		}

		if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			state.cameraStatus = "blocked";
			state.cameraError = "Camera access is unavailable in this browser context.";
			setCameraStatus(state.cameraError, true);
			return;
		}

		state.cameraStatus = "starting";
		state.cameraError = "";
		setCameraStatus("Starting camera. Allow permission if prompted.");

		navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
			.then((stream) => {
				cameraStream = stream;
				state.cameraStatus = "ready";
				state.cameraError = "";
				const currentVideo = document.getElementById("camera-preview");
				if (currentVideo) {
					currentVideo.srcObject = stream;
					currentVideo.play().catch(() => {});
				}
				setCameraStatus("Camera ready. Capture a selfie to unlock printing.");
			})
			.catch(() => {
				state.cameraStatus = "blocked";
				state.cameraError = "Camera permission is required before printing.";
				setCameraStatus(state.cameraError, true);
			});
	}

	function stopCertificateCamera() {
		if (!cameraStream) return;
		cameraStream.getTracks().forEach((track) => track.stop());
		cameraStream = null;
	}

	function captureSelfie() {
		const video = document.getElementById("camera-preview");
		const canvas = document.getElementById("photo-canvas");

		if (!video || !canvas) return;
		if (!video.videoWidth || !video.videoHeight) {
			state.cameraError = "Camera is still starting. Try again in a moment.";
			setCameraStatus(state.cameraError, true);
			return;
		}

		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext("2d");
		ctx.translate(canvas.width, 0);
		ctx.scale(-1, 1);
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

		state.selfieDataUrl = canvas.toDataURL("image/jpeg", 0.9);
		state.cameraStatus = "captured";
		state.cameraError = "";
		stopCertificateCamera();
		render();
	}

	function retakeSelfie() {
		state.selfieDataUrl = null;
		state.cameraStatus = "idle";
		state.cameraError = "";
		render();
	}

	function setCameraStatus(message, isError = false) {
		const status = document.getElementById("camera-status");
		if (!status) return;
		status.textContent = message;
		status.classList.toggle("error", isError);
	}

	function certificateCameraMessage() {
		if (state.cameraError) return state.cameraError;
		if (state.selfieDataUrl) return "Selfie captured. Printing is unlocked.";
		if (state.cameraStatus === "starting") return "Starting camera. Allow permission if prompted.";
		if (state.cameraStatus === "ready") return "Camera ready. Capture a selfie to unlock printing.";
		return "Selfie required before printing.";
	}

	function renderLeaderboard() {
		const rows = readLeaderboard();
		return `
			<section class="screen leaderboard-screen">
				<div class="leaderboard-panel">
					<h1>Leaderboard</h1>
					${rows.length ? `
						<ol class="leaderboard-list">
							${rows.map((row, index) => renderLeaderRow(row, index)).join("")}
						</ol>
					` : `<div class="empty-state">No completed runs yet.</div>`}
					<div class="panel-actions">
						<button class="btn primary" type="button" data-action="home">Home</button>
						<button class="btn ghost" type="button" data-action="clear-leaderboard" ${rows.length ? "" : "disabled"}>Clear</button>
					</div>
				</div>
			</section>
		`;
	}

	function renderLeaderRow(row, index) {
		return `
			<li class="leader-row">
				<div class="rank">${index + 1}</div>
				<div class="leader-main">
					<strong>${escapeHtml(row.name)}</strong>
					<span>${escapeHtml(row.modeLabel || row.mode || "Run")} - ${escapeHtml(row.gradeLabel || "Grades")}</span>
				</div>
				<div class="leader-meta">${row.score} pts - ${row.firstTry || 0} first try${row.adminSkipped ? ` - ${row.adminSkipped} skipped` : ""} - ${formatDuration(row.ms || 0)}</div>
			</li>
		`;
	}

	function renderFatalError() {
		return `
			<section class="screen leaderboard-screen">
				<div class="leaderboard-panel">
					<h1>Content failed to load</h1>
					<p class="empty-state">The grade catalog was not found. Check that data.js loads before script.js.</p>
				</div>
			</section>
		`;
	}

	function currentGrade() {
		return gradeById(state.currentGrade) || GRADE_CATALOG[0];
	}

	function currentQuestion() {
		return currentGrade().questions[state.currentQuestion] || currentGrade().questions[0];
	}

	function gradeById(id) {
		return GRADE_CATALOG.find((grade) => grade.id === Number(id));
	}

	function totalQuestionsInRun() {
		if (state.mode === "practice") return gradeById(state.startGrade).questions.length;
		return GRADE_CATALOG
			.filter((grade) => grade.id >= state.startGrade)
			.reduce((total, grade) => total + grade.questions.length, 0);
	}

	function totalCatalogQuestions() {
		return GRADE_CATALOG.reduce((total, grade) => total + grade.questions.length, 0);
	}

	function supportedQuestionTypes() {
		return [...new Set(GRADE_CATALOG.flatMap((grade) => grade.questions.map((question) => question.type)))];
	}

	function answeredCount() {
		return state.answerLog.length;
	}

	function totalAdminSkipped() {
		return state.answerLog.filter((item) => item.adminSkipped).length;
	}

	function questionProgressPercent() {
		if (state.phase === "gradeComplete") return 100;
		const grade = currentGrade();
		const local = state.feedback && state.feedback.correct ? state.currentQuestion + 1 : state.currentQuestion;
		return Math.round((local / grade.questions.length) * 100);
	}

	function continueLabel() {
		const grade = currentGrade();
		if (state.currentQuestion < grade.questions.length - 1) return "Next Question";
		return "Complete Grade";
	}

	function gradeCompleteButtonLabel() {
		if (!state.gradeComplete) return "Continue";
		if (state.gradeComplete.finishedRun) return "View Reward";
		return `Start Grade ${state.gradeComplete.gradeId + 1}`;
	}

	function modeLabel() {
		return state.mode === "practice" ? "Practice" : "OSSD Challenge";
	}

	function journeySummary() {
		if (state.mode === "practice") return `Practice run for Grade ${state.startGrade}.`;
		return `Grade ${state.startGrade} through Grade 12.`;
	}

	function mascotForState() {
		if (state.phase === "gradeComplete") {
			return { src: MASCOTS.clap, speech: "Grade cleared. Take the stamp and keep moving." };
		}
		if (state.feedback && state.feedback.correct) {
			return {
				src: MASCOTS.happy,
				speech: state.currentStreak >= 3 ? `First-try streak: ${state.currentStreak}.` : "Good answer. Lock it in and keep going."
			};
		}
		if (state.feedback && !state.feedback.correct) {
			return {
				src: state.currentAttempts > 1 ? MASCOTS.thinking : MASCOTS.sad,
				speech: state.currentAttempts > 1 ? "Slow down and compare the clues." : "Try one more pass."
			};
		}
		return { src: MASCOTS.teaching, speech: `Grade ${state.currentGrade}: ${currentGrade().focus}` };
	}

	function gradeStats(gradeId) {
		const logs = state.answerLog.filter((item) => item.grade === gradeId);
		return {
			points: logs.reduce((total, item) => total + item.points, 0),
			firstTry: logs.filter((item) => item.firstTry).length,
			missed: logs.filter((item) => !item.firstTry && !item.adminSkipped).length,
			skipped: logs.filter((item) => item.adminSkipped).length,
			total: gradeById(gradeId).questions.length
		};
	}

	function gradeCompleteMessage(stats) {
		if (stats.skipped > 0) return `${stats.skipped} prompts were passed by admin. No points were awarded for skipped prompts.`;
		if (stats.missed === 0) return "Clean grade. No review items were added.";
		if (stats.missed === 1) return "One prompt was added to your final review.";
		return `${stats.missed} prompts were added to your final review.`;
	}

	function runSummary() {
		const grades = state.completedGrades.slice().sort((a, b) => a - b);
		const gradeLabel = grades.length === 1 ? `Grade ${grades[0]}` : `Grades ${grades[0]}-${grades[grades.length - 1]}`;
		return {
			title: `${gradeLabel} complete`,
			gradeLabel,
			message: `${state.playerName} scored ${state.score} points across ${answeredCount()} prompts.`
		};
	}

	function buildLeaderboardEntry() {
		const summary = runSummary();
		return {
			id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			name: state.playerName,
			mode: state.mode,
			modeLabel: modeLabel(),
			gradeLabel: summary.gradeLabel,
			score: state.score,
			grades: state.completedGrades.length,
			firstTry: state.firstTry,
			bestStreak: state.bestStreak,
			reviewItems: state.missedQuestions.length,
			adminSkipped: totalAdminSkipped(),
			ms: elapsedMs(),
			date: new Date().toISOString()
		};
	}

	function buildMissedEntry(question, attempts) {
		return {
			grade: state.currentGrade,
			questionId: question.id,
			subject: question.subject,
			prompt: question.prompt,
			answer: answerLabel(question),
			explanation: question.explanation,
			attempts
		};
	}

	function answerLabel(question) {
		if (question.type === "choice") return question.options[question.answer];
		if (question.type === "fill") return question.answers[0];
		if (question.type === "match") {
			return question.pairs.map((pair) => `${pair.label}: ${pair.answer}`).join("; ");
		}
		return "See explanation";
	}

	function readLeaderboard() {
		try {
			const rows = JSON.parse(localStorage.getItem(STORAGE_KEYS.leaderboard) || "[]");
			return rows
				.filter((row) => row && row.name)
				.sort((a, b) => b.score - a.score || b.grades - a.grades || a.ms - b.ms)
				.slice(0, 25);
		} catch {
			return [];
		}
	}

	function writeLeaderboard(rows) {
		const sorted = rows
			.sort((a, b) => b.score - a.score || b.grades - a.grades || a.ms - b.ms)
			.slice(0, 25);
		localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(sorted));
	}

	function readLastSetup() {
		try {
			const setup = JSON.parse(localStorage.getItem(STORAGE_KEYS.lastSetup) || "{}");
			return {
				name: typeof setup.name === "string" ? setup.name : "",
				mode: setup.mode === "practice" ? "practice" : "challenge",
				startGrade: gradeById(Number(setup.startGrade)) ? Number(setup.startGrade) : 1
			};
		} catch {
			return { name: "", mode: "challenge", startGrade: 1 };
		}
	}

	function saveLastSetup(setup) {
		localStorage.setItem(STORAGE_KEYS.lastSetup, JSON.stringify(setup));
	}

	function startClock() {
		stopClock();
		timerId = window.setInterval(updateTimerDisplay, 1000);
	}

	function stopClock() {
		if (timerId) {
			window.clearInterval(timerId);
			timerId = null;
		}
	}

	function updateTimerDisplay() {
		const timer = app.querySelector("[data-timer]");
		if (timer) timer.textContent = formatDuration(elapsedMs());
	}

	function elapsedMs() {
		if (!state.startedAt) return 0;
		const end = state.finishedAt || Date.now();
		return Math.max(0, end - state.startedAt);
	}

	function formatDuration(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	}

	function todayLabel() {
		return new Date().toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric"
		});
	}

	function getRoute() {
		const route = window.location.hash.replace(/^#\/?/, "") || "home";
		return ["home", "game", "reward", "results", "certificate", "leaderboard"].includes(route) ? route : "home";
	}

	function navigate(route) {
		state.route = route === "results" ? "reward" : route;
		if (getRoute() === route) {
			render();
			return;
		}
		window.location.hash = route;
		render();
	}

	function normalize(value) {
		return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	function escapeAttr(value) {
		return escapeHtml(value);
	}
})();
