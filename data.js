/* Flexi OSSD Challenge - starter content bank */
(function () {
	"use strict";

	function choice(id, subject, prompt, options, answer, explanation) {
		return { id, type: "choice", subject, prompt, options, answer, explanation };
	}

	function fill(id, subject, prompt, answers, inputMode, explanation) {
		return { id, type: "fill", subject, prompt, answers, inputMode, explanation };
	}

	function match(id, subject, prompt, pairs, choices, explanation) {
		return {
			id,
			type: "match",
			subject,
			prompt,
			pairs: pairs.map(([label, answer]) => ({ label, answer })),
			choices,
			explanation
		};
	}

	window.FLEXI_GRADE_CATALOG = [
		{
			id: 1,
			title: "First Steps",
			focus: "Counting, living things, and simple words",
			color: "#008ca8",
			questions: [
				choice("g1-q1", "Science", "Which one is a living thing?", ["Rock", "Plant", "Chair", "Shoe"], 1, "Plants grow and need water, air, and light."),
				fill("g1-q2", "Math", "2 + 1 =", ["3"], "numeric", "Two plus one makes three."),
				choice("g1-q3", "English", "Which word names a person?", ["Run", "Teacher", "Blue", "Small"], 1, "Teacher names a person."),
				match("g1-q4", "Reasoning", "Match each item to its group.", [
					["Red", "color"],
					["Circle", "shape"],
					["Three", "number"]
				], ["color", "shape", "number"], "Each item belongs to one clear group.")
			]
		},
		{
			id: 2,
			title: "Pattern Builder",
			focus: "Subtraction, spelling, and patterns",
			color: "#ef6047",
			questions: [
				choice("g2-q1", "Math", "What is 5 - 2?", ["2", "3", "4", "7"], 1, "Taking away two from five leaves three."),
				fill("g2-q2", "English", "The boy ____ a book.", ["reads", "read"], "text", "Reads fits the sentence in present tense."),
				choice("g2-q3", "English", "Choose the correct spelling.", ["frend", "friend", "freind", "frendd"], 1, "Friend is the correct spelling."),
				match("g2-q4", "Math", "Match the pattern to what comes next.", [
					["2, 4, 6, ...", "8"],
					["A, B, C, ...", "D"],
					["10, 9, 8, ...", "7"]
				], ["8", "D", "7"], "Each sequence changes by one steady rule.")
			]
		},
		{
			id: 3,
			title: "Explorer Basics",
			focus: "Addition, space, plurals, and facts",
			color: "#3aa66b",
			questions: [
				choice("g3-q1", "Math", "What is 8 + 5?", ["11", "12", "13", "14"], 2, "Eight plus five equals thirteen."),
				fill("g3-q2", "Science", "The Sun is a ____.", ["star"], "text", "The Sun is the star at the center of our solar system."),
				choice("g3-q3", "English", "Which sentence uses a capital letter correctly?", ["i like math.", "I like math.", "i Like math.", "I like Math."], 1, "The pronoun I is always capitalized."),
				match("g3-q4", "English", "Match each word to its plural.", [
					["box", "boxes"],
					["baby", "babies"],
					["book", "books"]
				], ["books", "boxes", "babies"], "Plural spelling changes depend on the word ending.")
			]
		},
		{
			id: 4,
			title: "Skill Climber",
			focus: "Water cycle, grammar, and multiplication",
			color: "#6750a4",
			questions: [
				choice("g4-q1", "Science", "Which process turns water into water vapor?", ["Freezing", "Melting", "Evaporation", "Condensation"], 2, "Evaporation changes liquid water into vapor."),
				choice("g4-q2", "English", "She ____ to school every day.", ["walk", "walks", "walking", "walked"], 1, "She walks is the correct subject-verb match."),
				fill("g4-q3", "Math", "6 x 4 =", ["24"], "numeric", "Six groups of four make twenty-four."),
				choice("g4-q4", "English", "Choose the correctly spelled word.", ["because", "becaus", "becuase", "beacuse"], 0, "Because is the correct spelling.")
			]
		},
		{
			id: 5,
			title: "Energy Lab",
			focus: "Bigger numbers, conditionals, and resources",
			color: "#bf7a00",
			questions: [
				choice("g5-q1", "Math", "What is 125 - 48?", ["67", "77", "83", "87"], 1, "125 minus 48 equals 77."),
				choice("g5-q2", "English", "If it ____ tomorrow, we will stay home.", ["rain", "rains", "rained", "raining"], 1, "If it rains is the correct conditional form."),
				choice("g5-q3", "Science", "Which one is a renewable energy source?", ["Coal", "Wind", "Gasoline", "Oil"], 1, "Wind can be naturally replenished."),
				fill("g5-q4", "Math", "Half of 90 is ____.", ["45"], "numeric", "Half means divide by two.")
			]
		},
		{
			id: 6,
			title: "Systems Thinker",
			focus: "Body systems, ecosystems, and decimals",
			color: "#00796b",
			questions: [
				choice("g6-q1", "Science", "Which organ pumps blood through the body?", ["Lungs", "Stomach", "Heart", "Brain"], 2, "The heart pumps blood."),
				choice("g6-q2", "English", "____ going to rain today.", ["She's", "It's", "They're", "Were"], 1, "It's means it is."),
				fill("g6-q3", "Math", "0.5 + 0.25 =", ["0.75", ".75"], "decimal", "Five tenths plus twenty-five hundredths equals seventy-five hundredths."),
				match("g6-q4", "Science", "Match each ecosystem role to an example.", [
					["Producer", "grass"],
					["Consumer", "lion"],
					["Decomposer", "mushroom"]
				], ["grass", "lion", "mushroom"], "Producers make food, consumers eat, and decomposers break material down.")
			]
		},
		{
			id: 7,
			title: "Force Field",
			focus: "Integers, gravity, units, and digestion",
			color: "#455a64",
			questions: [
				choice("g7-q1", "Math", "What is -6 + 9?", ["-15", "-3", "3", "15"], 2, "Moving nine steps up from negative six lands on three."),
				choice("g7-q2", "Science", "Which body system breaks down food into nutrients?", ["Respiratory", "Digestive", "Skeletal", "Nervous"], 1, "The digestive system breaks down food."),
				fill("g7-q3", "Science", "The force that pulls objects toward Earth is called ____.", ["gravity"], "text", "Gravity pulls masses toward each other."),
				match("g7-q4", "Science", "Match each quantity to its SI unit.", [
					["Length", "meter"],
					["Mass", "kilogram"],
					["Time", "second"]
				], ["meter", "kilogram", "second"], "These are standard SI units.")
			]
		},
		{
			id: 8,
			title: "Precision Studio",
			focus: "Particles, agreement, spelling, and ratios",
			color: "#c13f71",
			questions: [
				choice("g8-q1", "Science", "Which particle has a negative charge?", ["Proton", "Neutron", "Electron", "Atom"], 2, "Electrons have negative charge."),
				choice("g8-q2", "English", "Neither the students nor the teacher ____ arriving late.", ["are", "is", "were", "be"], 1, "The verb agrees with teacher, so is is correct."),
				fill("g8-q3", "Math", "A ratio of 2:3 has how many total parts?", ["5"], "numeric", "Two parts plus three parts equals five parts."),
				choice("g8-q4", "English", "Choose the correctly spelled word.", ["necessary", "neccesary", "necesary", "nessesary"], 0, "Necessary is the correct spelling.")
			]
		},
		{
			id: 9,
			title: "Analysis Lab",
			focus: "Compounds, vocabulary, grammar, and percent",
			color: "#7b5e00",
			questions: [
				choice("g9-q1", "Science", "Which one is a compound?", ["Oxygen", "Gold", "Water", "Helium"], 2, "Water is made of hydrogen and oxygen atoms bonded together."),
				choice("g9-q2", "English", "Which word means the same as analyze?", ["Ignore", "Examine", "Guess", "Erase"], 1, "Analyze means examine closely."),
				choice("g9-q3", "English", "Neither of the answers ____ correct.", ["are", "were", "is", "be"], 2, "Neither is singular here, so is is correct."),
				fill("g9-q4", "Math", "25% of 80 is ____.", ["20"], "numeric", "One quarter of eighty is twenty.")
			]
		},
		{
			id: 10,
			title: "Equation Workshop",
			focus: "Algebra, tense, organs, and spelling",
			color: "#006d9c",
			questions: [
				choice("g10-q1", "Math", "Solve for x: x + 8 = 20.", ["10", "12", "14", "18"], 1, "Subtract eight from both sides."),
				choice("g10-q2", "English", "She ____ her homework before dinner.", ["finish", "finished", "finishing", "finishes yesterday"], 1, "Finished is the correct past-tense verb."),
				match("g10-q3", "Science", "Match each organ to what it does.", [
					["Heart", "pumps blood"],
					["Lungs", "takes in oxygen"],
					["Stomach", "helps digest food"]
				], ["pumps blood", "takes in oxygen", "helps digest food"], "Each organ has a primary job in the body."),
				choice("g10-q4", "English", "Choose the correct spelling.", ["finaly", "finally", "finnaly", "finelly"], 1, "Finally is the correct spelling.")
			]
		},
		{
			id: 11,
			title: "Readiness Check",
			focus: "Physics, percentages, vocabulary, and body systems",
			color: "#6d4c41",
			questions: [
				choice("g11-q1", "Science", "Speed is distance divided by ____.", ["mass", "force", "time", "energy"], 2, "Speed equals distance divided by time."),
				fill("g11-q2", "Math", "10% of 250 =", ["25"], "numeric", "Ten percent means one tenth."),
				choice("g11-q3", "English", "The word beneficial most nearly means ____.", ["harmful", "noisy", "helpful", "rare"], 2, "Beneficial means helpful or useful."),
				match("g11-q4", "Science", "Match each body system to its main function.", [
					["Circulatory", "moves blood"],
					["Respiratory", "gas exchange"],
					["Digestive", "breaks down food"]
				], ["moves blood", "gas exchange", "breaks down food"], "The systems work together but have different main roles.")
			]
		},
		{
			id: 12,
			title: "OSSD Launch",
			focus: "Biology, language, literature, and final checks",
			color: "#2f3a8f",
			questions: [
				choice("g12-q1", "Science", "Plants mainly release ____ during photosynthesis.", ["Nitrogen", "Carbon dioxide", "Oxygen", "Helium"], 2, "Photosynthesis releases oxygen."),
				fill("g12-q2", "Science", "DNA is found in the cell ____.", ["nucleus"], "text", "In many cells, DNA is housed in the nucleus."),
				choice("g12-q3", "English", "The word evaluate most nearly means ____.", ["ignore", "assess", "confuse", "announce"], 1, "Evaluate means assess or judge."),
				match("g12-q4", "English", "Match each literary term to its definition.", [
					["Simile", "comparison using like or as"],
					["Metaphor", "direct comparison"],
					["Hyperbole", "deliberate exaggeration"]
				], ["comparison using like or as", "direct comparison", "deliberate exaggeration"], "These terms describe common figurative language moves.")
			]
		}
	];
})();
