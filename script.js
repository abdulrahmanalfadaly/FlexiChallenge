/* Flexi OSSD Challenge - Phase 2 game engine */
(function () {
	"use strict";

	const app = document.getElementById("app");
	const DEFAULT_GRADE_CATALOG = normalizeCatalog(Array.isArray(window.FLEXI_GRADE_CATALOG) ? window.FLEXI_GRADE_CATALOG : []);

	// Certificate stamp image placeholder:
	// Put your stamp image in the img folder, then set this to something like "img/ossd_stamp.png".
	// Leave it blank to show the built-in certificate-only placeholder stamp.
	const CERTIFICATE_STAMP_IMAGE = "img/ossd_stamp.png";

	const STORAGE_KEYS = {
		lastSetup: "flexi:v2:lastSetup",
		leaderboard: "flexi:v2:leaderboard",
		catalog: "flexi:v2:catalog"
	};

	let GRADE_CATALOG = readCatalog();

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
			stampAnimateOnRender: false,
			cameraStatus: "idle",
			cameraError: "",
			feedback: null,
			gradeComplete: null,
			leaderboardEntryId: null,
			settingsGradeId: setup.startGrade || 1,
			settingsQuestionId: "",
			settingsCategory: "all",
			settingsMessage: ""
		};
	}

	let state = freshState();
	let timerId = null;
	let cameraStream = null;
	let routeTransitionTimer = null;
	let routeTransitionCleanupTimer = null;
	let autoRewardTimer = null;
	let isRouteTransitioning = false;
	let shouldFadeNextRender = false;
	let renderedRoute = "";

	app.addEventListener("submit", handleSubmit);
	app.addEventListener("click", handleClick);
	app.addEventListener("change", handleChange);
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
			return;
		}

		if (form.dataset.form === "settings-grade") {
			saveSettingsGrade(form);
			return;
		}

		if (form.dataset.form === "settings-question") {
			saveSettingsQuestion(form);
			return;
		}

		if (form.dataset.form === "settings-import") {
			importSettingsCatalog(form);
		}
	}

	function handleChange(event) {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		if (target.matches("[data-settings-grade-select]")) {
			selectSettingsGrade(Number(target.value));
			return;
		}

		if (target.matches("[data-settings-category-select]")) {
			state.settingsCategory = String(target.value || "all");
			state.settingsQuestionId = firstSettingsQuestionId();
			state.settingsMessage = "";
			render();
			return;
		}

		if (target.matches("[data-settings-question-select]")) {
			selectSettingsQuestion(String(target.value || ""));
			return;
		}

		if (target.matches("[data-settings-type-select]")) {
			changeSettingsQuestionType(String(target.value || "choice"));
		}
	}

	function handleClick(event) {
		const actionTarget = event.target.closest("[data-action]");
		if (!actionTarget) return;

		switch (actionTarget.dataset.action) {
			case "leaderboard":
				navigate("leaderboard");
				break;
			case "start-setup":
				resetSessionForRoute("setup");
				break;
			case "settings":
				navigate("settings");
				break;
			case "settings-select-grade":
				selectSettingsGrade(Number(actionTarget.dataset.gradeId));
				break;
			case "settings-select-question":
				selectSettingsQuestion(String(actionTarget.dataset.questionId || ""));
				break;
			case "home":
				clearAutoRewardTimer();
				stopClock();
				resetSessionForRoute("home");
				break;
			case "quit-run":
				clearAutoRewardTimer();
				stopClock();
				resetSessionForRoute("home");
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
			case "skip-question":
				skipQuestion();
				break;
			case "settings-add-question":
				addSettingsQuestion();
				break;
			case "settings-duplicate-question":
				duplicateSettingsQuestion();
				break;
			case "settings-delete-question":
				deleteSettingsQuestion();
				break;
			case "settings-move-question":
				moveSettingsQuestion(actionTarget.dataset.direction);
				break;
			case "settings-reset-catalog":
				resetSettingsCatalog();
				break;
			case "settings-export-catalog":
				exportSettingsCatalog();
				break;
			case "restart-run":
				clearAutoRewardTimer();
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
		clearAutoRewardTimer();
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
		navigate("game", { transition: "reverse" });
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
		recordCorrectAnswer(question, state.currentAttempts, true);
	}

	function recordCorrectAnswer(question, attemptsBefore, showFeedback) {
		const wasFirstTry = attemptsBefore === 0;
		const basePoints = Math.max(1, 3 - attemptsBefore);
		let streakBonus = 0;

		if (wasFirstTry) {
			state.firstTry += 1;
			state.currentStreak += 1;
			state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
			streakBonus = state.currentStreak >= 3 ? 1 : 0;
		} else {
			state.currentStreak = 0;
			state.missedQuestions.push(buildMissedEntry(question, attemptsBefore + 1));
		}

		const points = basePoints + streakBonus;
		state.score += points;
		state.answerLog.push({
			grade: state.currentGrade,
			questionId: question.id,
			subject: question.subject,
			prompt: question.prompt,
			firstTry: wasFirstTry,
			attempts: attemptsBefore + 1,
			basePoints,
			streakBonus,
			points
		});

		if (!showFeedback) return points;

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

			recordCorrectAnswer(question, index === state.currentQuestion ? state.currentAttempts : 0, false);
		});

		state.currentAttempts = 0;
		state.feedback = null;
		completeGrade(grade.id);
	}

	function skipQuestion() {
		if (!state.startedAt || state.finishedAt || state.phase !== "question") return;
		if (state.feedback && state.feedback.correct) return;

		const grade = currentGrade();
		const question = currentQuestion();
		const alreadyLogged = state.answerLog.some((item) => item.questionId === question.id);

		if (!alreadyLogged) {
			recordCorrectAnswer(question, state.currentAttempts, false);
		}

		state.currentAttempts = 0;
		state.feedback = null;

		if (state.currentQuestion < grade.questions.length - 1) {
			state.currentQuestion += 1;
			render();
			return;
		}

		completeGrade(grade.id);
	}

	function completeGrade(gradeId) {
		if (!state.completedGrades.includes(gradeId)) {
			state.completedGrades.push(gradeId);
		}

		const finishedRun = state.mode === "practice" || isFinalGrade(gradeId);
		if (finishedRun) {
			state.gradeComplete = null;
			state.feedback = null;
			finishRun();
			return;
		}

		state.phase = "gradeComplete";
		state.gradeComplete = {
			gradeId,
			finishedRun: false
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

		clearAutoRewardTimer();
		state.currentGrade = nextGradeIdInRun(gradeId) || gradeId;
		state.currentQuestion = 0;
		state.currentAttempts = 0;
		state.phase = "question";
		state.gradeComplete = null;
		state.feedback = null;
		render();
	}

	function finishRun() {
		clearAutoRewardTimer();
		if (!state.finishedAt) {
			state.finishedAt = Date.now();
			stopClock();
			const entry = buildLeaderboardEntry();
			state.leaderboardEntryId = entry.id;
			writeLeaderboard([entry, ...readLeaderboard()]);
		}
		navigate("reward");
	}

	function resetSessionForRoute(route, options = {}) {
		const previousRoute = renderedRoute || state.route || getRoute();
		state = freshState();
		state.route = previousRoute;
		navigate(route, options);
	}

	function scheduleAutoReward() {
		clearAutoRewardTimer();
		autoRewardTimer = window.setTimeout(() => {
			if (state.gradeComplete && state.gradeComplete.finishedRun && !state.finishedAt) {
				finishRun();
			}
		}, 1250);
	}

	function clearAutoRewardTimer() {
		if (!autoRewardTimer) return;
		window.clearTimeout(autoRewardTimer);
		autoRewardTimer = null;
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

		const normalizedRoute = nextRoute === "results" ? "reward" : nextRoute;
		if (isRouteTransitioning) {
			state.route = normalizedRoute;
			return;
		}

		const previousRoute = renderedRoute || state.route;
		if (normalizedRoute === "home" && previousRoute && previousRoute !== "home") {
			state = freshState();
		}
		state.route = normalizedRoute;

		if (shouldUseRouteTransition(previousRoute, normalizedRoute)) {
			beginRouteTransition();
			return;
		}

		render();
	}

	function render() {
		if (isRouteTransitioning) return;

		if (!GRADE_CATALOG.length) {
			app.innerHTML = renderFatalError();
			finishRender("home");
			return;
		}

		const route = state.route || getRoute();

		if (route === "game") {
			stopCertificateCamera();
			app.innerHTML = renderGame();
			updateTimerDisplay();
			finishRender("game");
			return;
		}

		if (route === "setup") {
			stopCertificateCamera();
			app.innerHTML = renderSetup();
			finishRender("setup");
			return;
		}

		if (route === "settings") {
			stopCertificateCamera();
			app.innerHTML = renderSettings();
			finishRender("settings");
			return;
		}

		if (route === "reward" || route === "results") {
			stopCertificateCamera();
			app.innerHTML = renderReward();
			finishRender("reward");
			return;
		}

		if (route === "certificate") {
			app.innerHTML = renderCertificate();
			startCertificateCamera();
			finishRender("certificate");
			return;
		}

		if (route === "leaderboard") {
			stopCertificateCamera();
			app.innerHTML = renderLeaderboard();
			finishRender("leaderboard");
			return;
		}

		stopCertificateCamera();
		app.innerHTML = renderHome();
		finishRender("home");
	}

	function finishRender(routeName) {
		renderedRoute = routeName;
		if (!shouldFadeNextRender) return;
		const screen = app.querySelector(".screen");
		if (screen) screen.classList.add("page-fade-in");
		shouldFadeNextRender = false;
	}

	function renderHome() {
		return `
			<section class="screen home-screen">
				<div class="home-inner home-launch">
					<div class="home-copy">
						<div class="brand-row home-title-row">
							<img class="logo" src="img/logo.png" alt="Flexi Academy" />
							<h1>Flexi Challenge</h1>
						</div>
						<p>Ready. Set. Flex.</p>
						<div class="home-actions" aria-label="Main menu">
							<button class="home-action primary-action" type="button" data-action="start-setup">
								<span>Start</span>
								<strong>Student challenge</strong>
							</button>
							<button class="home-action settings-action" type="button" data-action="settings">
								<span>Settings</span>
								<strong>Edit questions</strong>
							</button>
						</div>
					</div>
				</div>
			</section>
		`;
	}

	function renderSetup() {
		return `
			<section class="screen setup-screen">
				<div class="setup-shell">
					<form class="start-panel" data-form="start" autocomplete="off">
						<div class="mascot-hero">
							<img src="${MASCOTS.teaching}" alt="Flexi mascot" />
							<div>
								<h2>Start Challenge</h2>
								<p>Your setup is saved locally on this device.</p>
							</div>
						</div>

						<label class="field">
							<span>Student Name</span>
							<input name="name" type="text" value="${escapeAttr(state.playerName)}" placeholder="Type a name" required />
						</label>

						<label class="field">
							<span>Starting Grade</span>
							<select name="startGrade" required>
								<option value="" selected disabled>Select grade</option>
								${GRADE_CATALOG.map((grade) => `<option value="${grade.id}">Grade ${grade.id} - ${escapeHtml(grade.title)}</option>`).join("")}
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
							<button class="btn ghost" type="button" data-action="home">Back</button>
						</div>
					</form>
				</div>
			</section>
		`;
	}

	function renderSettings() {
		ensureSettingsSelection();
		const grade = selectedSettingsGrade();
		const question = selectedSettingsQuestion(grade);
		const categories = settingsCategories(grade);
		const filteredQuestions = filteredSettingsQuestions(grade);
		const catalogJson = JSON.stringify(GRADE_CATALOG, null, 2);

		return `
			<section class="screen settings-screen">
				<header class="settings-header">
					<div class="brand-row">
						<img class="logo" src="img/logo.png" alt="Flexi Academy" />
						<div>
							<p class="brand-kicker">Flexi Academy</p>
							<p class="brand-title">Question Settings</p>
						</div>
					</div>
					<div class="settings-header-actions">
						<button class="btn primary" type="button" data-action="start-setup">Start</button>
						<button class="btn ghost" type="button" data-action="home">Home</button>
					</div>
				</header>
				<div class="settings-shell">
					<aside class="settings-sidebar">
						<section class="settings-card">
							<h1>Question Bank</h1>
							<p>Edit grades, categories, prompts, answers, explanations, and question types.</p>
							<div class="settings-stats">
								<div><strong>${GRADE_CATALOG.length}</strong><span>grades</span></div>
								<div><strong>${totalCatalogQuestions()}</strong><span>questions</span></div>
								<div><strong>${settingsCategoryCount()}</strong><span>categories</span></div>
							</div>
							<label class="field">
								<span>Grade</span>
								<select data-settings-grade-select>
									${GRADE_CATALOG.map((item) => `<option value="${item.id}" ${item.id === grade.id ? "selected" : ""}>Grade ${item.id} - ${escapeHtml(item.title)}</option>`).join("")}
								</select>
							</label>
							<label class="field">
								<span>Category</span>
								<select data-settings-category-select>
									<option value="all" ${state.settingsCategory === "all" ? "selected" : ""}>All categories</option>
									${categories.map((category) => `<option value="${escapeAttr(category)}" ${state.settingsCategory === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
								</select>
							</label>
							<button class="btn primary full-width" type="button" data-action="settings-add-question">Add Question</button>
						</section>

						<section class="settings-card question-index">
							<h2>Questions</h2>
							<div class="settings-question-list">
								${filteredQuestions.length ? filteredQuestions.map((item, index) => `
									<button class="settings-question-button ${question && item.id === question.id ? "selected" : ""}" type="button" data-action="settings-select-question" data-question-id="${escapeAttr(item.id)}">
										<span>${index + 1}</span>
										<strong>${escapeHtml(item.prompt || "Untitled question")}</strong>
										<small>${escapeHtml(item.subject || "General")} - ${escapeHtml(typeLabel(item.type))}</small>
									</button>
								`).join("") : `<div class="empty-state">No questions in this category.</div>`}
							</div>
						</section>

						<section class="settings-card settings-tools">
							<h2>Tools</h2>
							<div class="settings-tool-actions">
								<button class="btn ghost" type="button" data-action="settings-export-catalog">Export JSON</button>
								<button class="btn ghost" type="button" data-action="settings-reset-catalog">Reset Defaults</button>
							</div>
							<form data-form="settings-import">
								<label class="field">
									<span>Import / export JSON</span>
									<textarea id="catalog-json" name="catalogJson" rows="7" spellcheck="false" placeholder="Paste a saved question bank JSON here.">${escapeHtml(state.settingsMessage === "Export ready." ? catalogJson : "")}</textarea>
								</label>
								<button class="btn primary full-width" type="submit">Import JSON</button>
							</form>
						</section>
					</aside>

					<main class="settings-main">
						${state.settingsMessage ? `<div class="settings-message">${escapeHtml(state.settingsMessage)}</div>` : ""}
						${renderSettingsGradeForm(grade)}
						${question ? renderSettingsQuestionForm(grade, question) : renderSettingsEmptyEditor()}
					</main>
				</div>
			</section>
		`;
	}

	function renderSettingsGradeForm(grade) {
		return `
			<form class="settings-card settings-grade-form" data-form="settings-grade">
				<div class="settings-section-heading">
					<div>
						<span class="subject-chip">Grade ${grade.id}</span>
						<h2>Grade Settings</h2>
					</div>
					<button class="btn primary" type="submit">Save Grade</button>
				</div>
				<div class="settings-grid three">
					<label class="field">
						<span>Grade title</span>
						<input name="title" type="text" value="${escapeAttr(grade.title)}" required />
					</label>
					<label class="field">
						<span>Grade color</span>
						<input name="color" type="color" value="${escapeAttr(normalizeHexColor(grade.color, "#008ca8"))}" />
					</label>
					<label class="field">
						<span>Question count</span>
						<input type="text" value="${grade.questions.length}" readonly />
					</label>
				</div>
				<label class="field">
					<span>Grade focus</span>
					<textarea name="focus" rows="2" required>${escapeHtml(grade.focus)}</textarea>
				</label>
			</form>
		`;
	}

	function renderSettingsQuestionForm(grade, question) {
		const index = grade.questions.findIndex((item) => item.id === question.id);
		return `
			<form class="settings-card question-editor" data-form="settings-question">
				<input type="hidden" name="originalId" value="${escapeAttr(question.id)}" />
				<div class="settings-section-heading">
					<div>
						<span class="subject-chip">${escapeHtml(question.subject || "General")}</span>
						<h2>Question Editor</h2>
					</div>
					<div class="settings-editor-actions">
						<button class="btn ghost" type="button" data-action="settings-move-question" data-direction="up" ${index <= 0 ? "disabled" : ""}>Move Up</button>
						<button class="btn ghost" type="button" data-action="settings-move-question" data-direction="down" ${index >= grade.questions.length - 1 ? "disabled" : ""}>Move Down</button>
						<button class="btn ghost" type="button" data-action="settings-duplicate-question">Duplicate</button>
						<button class="btn accent" type="button" data-action="settings-delete-question">Delete</button>
						<button class="btn primary" type="submit">Save Question</button>
					</div>
				</div>
				<div class="settings-grid three">
					<label class="field">
						<span>Question ID</span>
						<input name="id" type="text" value="${escapeAttr(question.id)}" required />
					</label>
					<label class="field">
						<span>Category / subject</span>
						<input name="subject" type="text" value="${escapeAttr(question.subject || "General")}" list="settings-categories" required />
						<datalist id="settings-categories">
							${settingsCategories(grade).map((category) => `<option value="${escapeAttr(category)}"></option>`).join("")}
						</datalist>
					</label>
					<label class="field">
						<span>Question type</span>
						<select name="type" data-settings-type-select>
							<option value="choice" ${question.type === "choice" ? "selected" : ""}>Multiple choice</option>
							<option value="fill" ${question.type === "fill" ? "selected" : ""}>Fill in the blank</option>
							<option value="match" ${question.type === "match" ? "selected" : ""}>Matching</option>
						</select>
					</label>
				</div>
				<label class="field">
					<span>Prompt</span>
					<textarea name="prompt" rows="3" required>${escapeHtml(question.prompt)}</textarea>
				</label>
				${renderSettingsTypeFields(question)}
				<label class="field">
					<span>Explanation shown after correct answer</span>
					<textarea name="explanation" rows="3" required>${escapeHtml(question.explanation)}</textarea>
				</label>
			</form>
		`;
	}

	function renderSettingsTypeFields(question) {
		if (question.type === "fill") {
			return `
				<div class="settings-grid two">
					<label class="field">
						<span>Accepted answers, one per line</span>
						<textarea name="answers" rows="5" required>${escapeHtml((question.answers || []).join("\n"))}</textarea>
					</label>
					<label class="field">
						<span>Input mode</span>
						<select name="inputMode">
							<option value="text" ${question.inputMode === "text" ? "selected" : ""}>Text</option>
							<option value="numeric" ${question.inputMode === "numeric" ? "selected" : ""}>Number</option>
							<option value="decimal" ${question.inputMode === "decimal" ? "selected" : ""}>Decimal</option>
						</select>
					</label>
				</div>
			`;
		}

		if (question.type === "match") {
			return `
				<div class="settings-grid two">
					<label class="field">
						<span>Pairs, one per line as prompt = answer</span>
						<textarea name="pairs" rows="7" required>${escapeHtml((question.pairs || []).map((pair) => `${pair.label} = ${pair.answer}`).join("\n"))}</textarea>
					</label>
					<label class="field">
						<span>Dropdown choices, one per line</span>
						<textarea name="choices" rows="7" required>${escapeHtml((question.choices || []).join("\n"))}</textarea>
					</label>
				</div>
			`;
		}

		const options = Array.isArray(question.options) && question.options.length ? question.options : ["Option A", "Option B"];
		return `
			<div class="settings-grid two">
				<label class="field">
					<span>Answer options, one per line</span>
					<textarea name="options" rows="7" required>${escapeHtml(options.join("\n"))}</textarea>
				</label>
				<label class="field">
					<span>Correct option</span>
					<select name="answer">
						${options.map((option, index) => `<option value="${index}" ${index === Number(question.answer) ? "selected" : ""}>${index + 1}. ${escapeHtml(option)}</option>`).join("")}
					</select>
				</label>
			</div>
		`;
	}

	function renderSettingsEmptyEditor() {
		return `
			<section class="settings-card">
				<div class="empty-state">Select a question, or add a new one.</div>
			</section>
		`;
	}

	function ensureSettingsSelection() {
		if (!GRADE_CATALOG.length) return;
		const grade = gradeById(state.settingsGradeId) || GRADE_CATALOG[0];
		state.settingsGradeId = grade.id;
		if (!settingsCategories(grade).includes(state.settingsCategory) && state.settingsCategory !== "all") {
			state.settingsCategory = "all";
		}
		const question = selectedSettingsQuestion(grade);
		state.settingsQuestionId = question ? question.id : "";
	}

	function selectedSettingsGrade() {
		return gradeById(state.settingsGradeId) || GRADE_CATALOG[0];
	}

	function selectedSettingsQuestion(grade = selectedSettingsGrade()) {
		if (!grade) return null;
		const filtered = filteredSettingsQuestions(grade);
		return filtered.find((item) => item.id === state.settingsQuestionId) || filtered[0] || grade.questions[0] || null;
	}

	function firstSettingsQuestionId() {
		const grade = selectedSettingsGrade();
		const question = selectedSettingsQuestion(grade);
		return question ? question.id : "";
	}

	function filteredSettingsQuestions(grade) {
		if (!grade) return [];
		if (state.settingsCategory === "all") return grade.questions;
		return grade.questions.filter((question) => question.subject === state.settingsCategory);
	}

	function settingsCategories(grade = selectedSettingsGrade()) {
		if (!grade) return [];
		return [...new Set(grade.questions.map((question) => question.subject || "General"))].sort((a, b) => a.localeCompare(b));
	}

	function settingsCategoryCount() {
		return new Set(GRADE_CATALOG.flatMap((grade) => grade.questions.map((question) => question.subject || "General"))).size;
	}

	function selectSettingsGrade(gradeId) {
		const grade = gradeById(gradeId);
		if (!grade) return;
		state.settingsGradeId = grade.id;
		state.settingsCategory = "all";
		state.settingsQuestionId = grade.questions[0] ? grade.questions[0].id : "";
		state.settingsMessage = "";
		render();
	}

	function selectSettingsQuestion(questionId) {
		state.settingsQuestionId = questionId;
		state.settingsMessage = "";
		render();
	}

	function saveSettingsGrade(form) {
		const grade = selectedSettingsGrade();
		if (!grade) return;
		const data = new FormData(form);
		grade.title = String(data.get("title") || "").trim() || `Grade ${grade.id}`;
		grade.focus = String(data.get("focus") || "").trim() || "Custom question set";
		grade.color = normalizeHexColor(String(data.get("color") || ""), grade.color);
		persistCatalog();
		state.settingsMessage = `Grade ${grade.id} saved.`;
		render();
	}

	function saveSettingsQuestion(form) {
		const grade = selectedSettingsGrade();
		const question = selectedSettingsQuestion(grade);
		if (!grade || !question) return;

		const data = new FormData(form);
		const originalId = String(data.get("originalId") || question.id);
		const requestedId = slugify(String(data.get("id") || originalId)) || originalId;
		const id = uniqueQuestionId(grade, requestedId, originalId);
		const type = supportedEditorType(String(data.get("type") || question.type));

		question.id = id;
		question.type = type;
		question.subject = String(data.get("subject") || "").trim() || "General";
		question.prompt = String(data.get("prompt") || "").trim() || "Untitled question";
		question.explanation = String(data.get("explanation") || "").trim() || "Review the question details.";

		if (type === "fill") {
			question.answers = parseLines(String(data.get("answers") || "")).length ? parseLines(String(data.get("answers") || "")) : ["answer"];
			question.inputMode = ["text", "numeric", "decimal"].includes(String(data.get("inputMode"))) ? String(data.get("inputMode")) : "text";
			delete question.options;
			delete question.answer;
			delete question.pairs;
			delete question.choices;
		} else if (type === "match") {
			question.pairs = parsePairs(String(data.get("pairs") || ""));
			if (!question.pairs.length) {
				question.pairs = [{ label: "Item", answer: "Match" }];
			}
			const choices = parseLines(String(data.get("choices") || ""));
			question.choices = uniqueStrings([...choices, ...question.pairs.map((pair) => pair.answer)]);
			delete question.options;
			delete question.answer;
			delete question.answers;
			delete question.inputMode;
		} else {
			question.options = parseLines(String(data.get("options") || ""));
			if (question.options.length < 2) {
				question.options = ["Option A", "Option B"];
			}
			question.answer = clampNumber(Number(data.get("answer")), 0, question.options.length - 1);
			delete question.answers;
			delete question.inputMode;
			delete question.pairs;
			delete question.choices;
		}

		state.settingsQuestionId = id;
		if (state.settingsCategory !== "all" && state.settingsCategory !== question.subject) {
			state.settingsCategory = question.subject;
		}
		persistCatalog();
		state.settingsMessage = "Question saved.";
		render();
	}

	function changeSettingsQuestionType(type) {
		const grade = selectedSettingsGrade();
		const question = selectedSettingsQuestion(grade);
		if (!grade || !question) return;
		Object.assign(question, convertQuestionType(question, supportedEditorType(type)));
		persistCatalog();
		state.settingsMessage = `Question changed to ${typeLabel(question.type)}.`;
		render();
	}

	function addSettingsQuestion() {
		const grade = selectedSettingsGrade();
		if (!grade) return;
		const question = defaultQuestion(grade.id);
		question.id = uniqueQuestionId(grade, question.id);
		grade.questions.push(question);
		state.settingsCategory = "all";
		state.settingsQuestionId = question.id;
		persistCatalog();
		state.settingsMessage = "New question added.";
		render();
	}

	function duplicateSettingsQuestion() {
		const grade = selectedSettingsGrade();
		const question = selectedSettingsQuestion(grade);
		if (!grade || !question) return;
		const copy = deepClone(question);
		copy.id = uniqueQuestionId(grade, `${question.id}-copy`);
		copy.prompt = `${question.prompt} copy`;
		const index = grade.questions.findIndex((item) => item.id === question.id);
		grade.questions.splice(index + 1, 0, copy);
		state.settingsQuestionId = copy.id;
		persistCatalog();
		state.settingsMessage = "Question duplicated.";
		render();
	}

	function deleteSettingsQuestion() {
		const grade = selectedSettingsGrade();
		const question = selectedSettingsQuestion(grade);
		if (!grade || !question) return;
		if (grade.questions.length <= 1) {
			state.settingsMessage = "Each grade needs at least one question.";
			render();
			return;
		}
		if (!window.confirm("Delete this question?")) return;
		const index = grade.questions.findIndex((item) => item.id === question.id);
		grade.questions.splice(index, 1);
		state.settingsQuestionId = (grade.questions[index] || grade.questions[index - 1] || grade.questions[0]).id;
		persistCatalog();
		state.settingsMessage = "Question deleted.";
		render();
	}

	function moveSettingsQuestion(direction) {
		const grade = selectedSettingsGrade();
		const question = selectedSettingsQuestion(grade);
		if (!grade || !question) return;
		const index = grade.questions.findIndex((item) => item.id === question.id);
		const nextIndex = direction === "up" ? index - 1 : index + 1;
		if (nextIndex < 0 || nextIndex >= grade.questions.length) return;
		const [moved] = grade.questions.splice(index, 1);
		grade.questions.splice(nextIndex, 0, moved);
		persistCatalog();
		state.settingsMessage = "Question moved.";
		render();
	}

	function resetSettingsCatalog() {
		if (!window.confirm("Reset all questions back to the default bank?")) return;
		GRADE_CATALOG = deepClone(DEFAULT_GRADE_CATALOG);
		localStorage.removeItem(STORAGE_KEYS.catalog);
		state.settingsGradeId = GRADE_CATALOG[0] ? GRADE_CATALOG[0].id : 1;
		state.settingsCategory = "all";
		state.settingsQuestionId = firstSettingsQuestionId();
		state.settingsMessage = "Default question bank restored.";
		render();
	}

	function exportSettingsCatalog() {
		const output = document.getElementById("catalog-json");
		if (output) {
			output.value = JSON.stringify(GRADE_CATALOG, null, 2);
			output.focus();
			output.select();
		}
		const message = app.querySelector(".settings-message");
		if (message) message.textContent = "Export ready.";
		state.settingsMessage = "Export ready.";
	}

	function importSettingsCatalog(form) {
		const data = new FormData(form);
		try {
			const imported = normalizeCatalog(JSON.parse(String(data.get("catalogJson") || "[]")));
			if (!imported.length) throw new Error("Empty catalog.");
			GRADE_CATALOG = imported;
			persistCatalog();
			state.settingsGradeId = GRADE_CATALOG[0].id;
			state.settingsCategory = "all";
			state.settingsQuestionId = firstSettingsQuestionId();
			state.settingsMessage = "Question bank imported.";
		} catch {
			state.settingsMessage = "Import failed. Paste valid exported JSON.";
		}
		render();
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
					<button class="btn skip" type="button" data-action="skip-question" ${state.phase === "gradeComplete" || state.feedback && state.feedback.correct ? "disabled" : ""}>Skip Question</button>
					<button class="btn admin" type="button" data-action="admin-pass-grade" ${state.phase === "gradeComplete" ? "disabled" : ""}>Skip challenge</button>
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
					${state.gradeComplete && state.gradeComplete.finishedRun
						? `<span class="auto-forward">Opening reward...</span>`
						: `<button class="btn primary" type="button" data-action="advance-grade">${gradeCompleteButtonLabel()}</button>`
					}
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
							<h1>${escapeHtml(summary.title)}</h1>
							<p>${escapeHtml(summary.message)}</p>
						</div>
					</div>
					<div class="reward-score-grid" aria-label="Run score summary">
						<div class="reward-score-card points-card">
							<div class="reward-score-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" focusable="false">
									<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
									<path d="M6 6H4a3 3 0 0 0 3 3" />
									<path d="M18 6h2a3 3 0 0 1-3 3" />
									<path d="M12 12v4" />
									<path d="M9 20h6" />
									<path d="M10 16h4v4h-4z" />
								</svg>
							</div>
							<div>
								<span>Points</span>
								<strong>${state.score}</strong>
							</div>
						</div>
						<div class="reward-score-card time-card">
							<div class="reward-score-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" focusable="false">
									<circle cx="12" cy="13" r="7" />
									<path d="M12 13V9" />
									<path d="M12 13l3 2" />
									<path d="M9 2h6" />
									<path d="M12 2v3" />
								</svg>
							</div>
							<div>
								<span>Time</span>
								<strong>${formatDuration(elapsedMs())}</strong>
							</div>
						</div>
					</div>
					${renderReviewSection()}
					<div class="panel-actions">
						<button class="btn accent" type="button" data-action="view-certificate">Certificate</button>
						<button class="btn primary" type="button" data-action="restart-run">Run Again</button>
						<button class="btn ghost" type="button" data-action="leaderboard">Leaderboard</button>
						<button class="btn icon-btn" type="button" data-action="home" aria-label="Home" title="Home">
							<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
								<path d="M3 10.5 12 3l9 7.5" />
								<path d="M5 10v10h5v-6h4v6h5V10" />
							</svg>
						</button>
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
		const stampShouldAnimate = state.stampAnimateOnRender;
		state.stampAnimateOnRender = false;
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
					${hasSelfie
						? `<div class="certificate-stamp ${CERTIFICATE_STAMP_IMAGE.trim() ? "has-custom-stamp" : "has-placeholder-stamp"} ${stampShouldAnimate ? "stamp-animate" : ""}" aria-label="Certificate stamp">
							${renderCertificateStamp()}
						</div>`
						: ""
					}
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

	function renderCertificateStamp() {
		const stampImage = CERTIFICATE_STAMP_IMAGE.trim();
		if (stampImage) {
			return `<img class="certificate-stamp-image" src="${escapeAttr(stampImage)}" alt="Certificate stamp" />`;
		}

		return `
			<div class="certificate-stamp-placeholder">
				<strong>OSSD</strong>
				<span>stamp image placeholder</span>
			</div>
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
		state.stampAnimateOnRender = true;
		state.cameraStatus = "captured";
		state.cameraError = "";
		stopCertificateCamera();
		render();
	}

	function retakeSelfie() {
		state.selfieDataUrl = null;
		state.stampAnimateOnRender = false;
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
		return runGrades().reduce((total, grade) => total + grade.questions.length, 0);
	}

	function runGrades() {
		if (state.mode === "practice") return [gradeById(state.startGrade)].filter(Boolean);
		return GRADE_CATALOG.filter((grade) => grade.id >= state.startGrade);
	}

	function nextGradeIdInRun(gradeId) {
		const nextGrade = runGrades().find((grade) => grade.id > gradeId);
		return nextGrade ? nextGrade.id : null;
	}

	function isFinalGrade(gradeId) {
		return !nextGradeIdInRun(gradeId);
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
		if (state.gradeComplete.finishedRun) return "Opening Reward";
		return `Start Grade ${state.gradeComplete.gradeId + 1}`;
	}

	function modeLabel() {
		return state.mode === "practice" ? "Practice" : "OSSD Challenge";
	}

	function journeySummary() {
		if (state.mode === "practice") return `Practice run for Grade ${state.startGrade}.`;
		const grades = runGrades();
		const finalGrade = grades[grades.length - 1];
		return `Grade ${state.startGrade} through Grade ${finalGrade ? finalGrade.id : state.startGrade}.`;
	}

	function mascotForState() {
		if (state.phase === "gradeComplete") {
			return { src: MASCOTS.clap, speech: "Grade cleared. Reward screen is opening." };
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

	function readCatalog() {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.catalog) || "null");
			const catalog = normalizeCatalog(saved);
			return catalog.length ? catalog : deepClone(DEFAULT_GRADE_CATALOG);
		} catch {
			return deepClone(DEFAULT_GRADE_CATALOG);
		}
	}

	function persistCatalog() {
		localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(GRADE_CATALOG));
	}

	function normalizeCatalog(catalog) {
		if (!Array.isArray(catalog)) return [];
		return catalog
			.map((grade, index) => normalizeGrade(grade, index + 1))
			.filter(Boolean)
			.sort((a, b) => a.id - b.id);
	}

	function normalizeGrade(grade, fallbackId) {
		if (!grade || typeof grade !== "object") return null;
		const id = Number(grade.id) || fallbackId;
		const questions = Array.isArray(grade.questions)
			? grade.questions.map((question, index) => normalizeQuestion(question, id, index + 1)).filter(Boolean)
			: [];
		if (!questions.length) questions.push(defaultQuestion(id));
		return {
			id,
			title: String(grade.title || `Grade ${id}`),
			focus: String(grade.focus || "Custom question set"),
			color: normalizeHexColor(grade.color, "#008ca8"),
			questions
		};
	}

	function normalizeQuestion(question, gradeId, index) {
		if (!question || typeof question !== "object") return defaultQuestion(gradeId, index);
		const type = supportedEditorType(question.type);
		const base = {
			id: String(question.id || `g${gradeId}-q${index}`),
			type,
			subject: String(question.subject || "General"),
			prompt: String(question.prompt || "Untitled question"),
			explanation: String(question.explanation || "Review the question details.")
		};

		if (type === "fill") {
			return {
				...base,
				answers: Array.isArray(question.answers) && question.answers.length ? question.answers.map(String) : ["answer"],
				inputMode: ["text", "numeric", "decimal"].includes(question.inputMode) ? question.inputMode : "text"
			};
		}

		if (type === "match") {
			const pairs = Array.isArray(question.pairs)
				? question.pairs
					.filter((pair) => pair && typeof pair === "object")
					.map((pair) => ({ label: String(pair.label || "Item"), answer: String(pair.answer || "Match") }))
				: [{ label: "Item", answer: "Match" }];
			const choices = Array.isArray(question.choices) ? question.choices.map(String) : [];
			return {
				...base,
				pairs: pairs.length ? pairs : [{ label: "Item", answer: "Match" }],
				choices: uniqueStrings([...choices, ...pairs.map((pair) => pair.answer)])
			};
		}

		const options = Array.isArray(question.options) && question.options.length >= 2 ? question.options.map(String) : ["Option A", "Option B"];
		return {
			...base,
			options,
			answer: clampNumber(Number(question.answer), 0, options.length - 1)
		};
	}

	function defaultQuestion(gradeId, index) {
		const stamp = Date.now().toString(36).slice(-5);
		return {
			id: `g${gradeId}-q${index || stamp}`,
			type: "choice",
			subject: "General",
			prompt: "New question prompt",
			options: ["Option A", "Option B", "Option C", "Option D"],
			answer: 0,
			explanation: "Explain why the correct answer is right."
		};
	}

	function convertQuestionType(question, type) {
		const base = {
			id: question.id,
			type,
			subject: question.subject || "General",
			prompt: question.prompt || "Untitled question",
			explanation: question.explanation || "Review the question details."
		};
		if (type === "fill") {
			return {
				...base,
				answers: [answerLabel(question)],
				inputMode: "text"
			};
		}
		if (type === "match") {
			return {
				...base,
				pairs: [{ label: "Item", answer: answerLabel(question) }],
				choices: [answerLabel(question)]
			};
		}
		return {
			...base,
			options: ["Option A", "Option B", "Option C", "Option D"],
			answer: 0
		};
	}

	function supportedEditorType(type) {
		return ["choice", "fill", "match"].includes(type) ? type : "choice";
	}

	function typeLabel(type) {
		if (type === "fill") return "Fill in the blank";
		if (type === "match") return "Matching";
		return "Multiple choice";
	}

	function parseLines(value) {
		return String(value || "")
			.split(/\r?\n/)
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function parsePairs(value) {
		return parseLines(value)
			.map((line) => {
				const separator = line.includes("=") ? "=" : line.includes("|") ? "|" : "";
				if (!separator) return null;
				const [label, ...answerParts] = line.split(separator);
				const answer = answerParts.join(separator).trim();
				if (!label.trim() || !answer) return null;
				return { label: label.trim(), answer };
			})
			.filter(Boolean);
	}

	function uniqueStrings(items) {
		return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
	}

	function uniqueQuestionId(grade, requestedId, currentId = "") {
		const base = slugify(requestedId) || `g${grade.id}-q`;
		let candidate = base;
		let index = 2;
		while (grade.questions.some((question) => question.id === candidate && question.id !== currentId)) {
			candidate = `${base}-${index}`;
			index += 1;
		}
		return candidate;
	}

	function slugify(value) {
		return String(value || "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	function clampNumber(value, min, max) {
		if (!Number.isFinite(value)) return min;
		return Math.min(max, Math.max(min, Math.round(value)));
	}

	function normalizeHexColor(value, fallback) {
		const color = String(value || "").trim();
		return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
	}

	function deepClone(value) {
		return JSON.parse(JSON.stringify(value));
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
				name: "",
				mode: setup.mode === "practice" ? "practice" : "challenge",
				startGrade: 1
			};
		} catch {
			return { name: "", mode: "challenge", startGrade: 1 };
		}
	}

	function saveLastSetup(setup) {
		localStorage.setItem(STORAGE_KEYS.lastSetup, JSON.stringify({
			mode: setup.mode
		}));
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
		return ["home", "setup", "settings", "game", "reward", "results", "certificate", "leaderboard"].includes(route) ? route : "home";
	}

	function navigate(route, options = {}) {
		const normalizedRoute = route === "results" ? "reward" : route;
		const previousRoute = renderedRoute || state.route || getRoute();
		const shouldTransition = shouldUseRouteTransition(previousRoute, normalizedRoute, options);

		state.route = normalizedRoute;
		if (shouldTransition) {
			beginRouteTransition(options.transition);
		}

		if (getRoute() === normalizedRoute) {
			if (!shouldTransition) render();
			return;
		}
		window.location.hash = normalizedRoute;
		if (!shouldTransition) render();
	}

	function shouldUseRouteTransition(previousRoute, nextRoute, options = {}) {
		return options.transition !== "none"
			&& previousRoute
			&& previousRoute !== nextRoute
			&& previousRoute !== "settings"
			&& nextRoute !== "settings"
			&& app.innerHTML.trim().length > 0;
	}

	function beginRouteTransition(variant = "forward") {
		const overlay = ensureRouteTransition();
		isRouteTransitioning = true;
		window.clearTimeout(routeTransitionTimer);
		window.clearTimeout(routeTransitionCleanupTimer);

		overlay.classList.remove("leaving");
		overlay.classList.remove("active");
		overlay.classList.remove("reverse");
		if (variant === "reverse") {
			overlay.classList.add("reverse");
		}
		void overlay.offsetWidth;
		overlay.classList.add("active");

		routeTransitionTimer = window.setTimeout(() => {
			isRouteTransitioning = false;
			shouldFadeNextRender = true;
			render();
			overlay.classList.add("leaving");
			routeTransitionCleanupTimer = window.setTimeout(() => {
				overlay.classList.remove("active");
				overlay.classList.remove("leaving");
				overlay.classList.remove("reverse");
			}, 220);
		}, 660);
	}

	function ensureRouteTransition() {
		let overlay = document.getElementById("route-transition");
		if (overlay) return overlay;

		overlay = document.createElement("div");
		overlay.id = "route-transition";
		overlay.className = "route-transition";
		overlay.setAttribute("aria-hidden", "true");
		overlay.innerHTML = `
			<div class="transition-wash"></div>
			<div class="transition-ribbon ribbon-one"></div>
			<div class="transition-ribbon ribbon-two"></div>
			<div class="transition-sparks">
				<span></span><span></span><span></span><span></span><span></span>
			</div>
			<img class="transition-flexi" src="${MASCOTS.happy}" alt="" />
		`;
		document.body.appendChild(overlay);
		return overlay;
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
