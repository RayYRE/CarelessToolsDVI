// ==UserScript==
// @name         Careless Tools · Profit
// @namespace    https://carelesstoolsdvi.carelesscapybara.workers.dev/
// @version      1.0
// @description  Shows estimated profit next to each job's xp/h in Deep Vein Idle. Read-only: never sends game commands.
// @match        https://deepveinidle.com/*
// @match        https://cn.deepveinidle.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(function() {
	//#region src/game/levels.js
	var TOTAL_XP_1_TO_100 = [
		0,
		100,
		212,
		337,
		478,
		635,
		812,
		1009,
		1230,
		1478,
		1755,
		2065,
		2413,
		2803,
		3239,
		3728,
		4275,
		4888,
		5575,
		6344,
		7205,
		8170,
		9250,
		10460,
		11816,
		13333,
		15033,
		16937,
		19070,
		21458,
		24133,
		27129,
		30485,
		34243,
		38452,
		43166,
		48446,
		54360,
		60983,
		68401,
		76709,
		86014,
		96436,
		108108,
		121181,
		135823,
		152222,
		170588,
		191159,
		214198,
		240002,
		268902,
		301270,
		337523,
		378125,
		423601,
		474533,
		531576,
		595466,
		667022,
		747164,
		836924,
		937455,
		1050049,
		1176155,
		1317394,
		1475581,
		1652751,
		1851181,
		2073422,
		2322333,
		2601113,
		2913347,
		3263048,
		3654714,
		4093380,
		4584685,
		5134948,
		5751241,
		6441490,
		7214569,
		8080418,
		9050168,
		10136288,
		11352742,
		12715171,
		14241092,
		15950123,
		17864238,
		20008046,
		22409112,
		25098305,
		28110202,
		31483526,
		35261649,
		39493147,
		44232425,
		49540416,
		55485366,
		61033903
	];
	var ANCHORS_ABOVE_100 = {
		110: 186915284,
		120: 674462148,
		130: 2562763195,
		140: 9876277257,
		150: 38201997890,
		160: 147909375566,
		170: 572813259665,
		180: 2218493928967,
		190: 8592323321144,
		200: 33278583467707,
		210: 0x7539901e32e6,
		220: 499199745957762,
		230: 0x6de72898fb470,
		240: 7488314487089727
	};
	var TOTAL_XP = [0, ...TOTAL_XP_1_TO_100];
	var ESTIMATED_LEVELS = /* @__PURE__ */ new Set();
	for (let base = 100; base < 240; base += 10) {
		const from = TOTAL_XP[base];
		const to = ANCHORS_ABOVE_100[base + 10];
		for (let i = 1; i < 10; i++) {
			TOTAL_XP[base + i] = Math.round(from * Math.pow(to / from, i / 10));
			ESTIMATED_LEVELS.add(base + i);
		}
		TOTAL_XP[base + 10] = to;
	}
	//#endregion
	//#region src/game/rarities.js
	var RARITIES = [
		{
			name: "Common",
			gameName: "Normal",
			multiplier: 1,
			oneIn: 1,
			toolLuck: 0,
			points: 1
		},
		{
			name: "Uncommon",
			gameName: "Uncommon",
			multiplier: 1.5,
			oneIn: 40,
			toolLuck: .25,
			points: 3
		},
		{
			name: "Rare",
			gameName: "Rare",
			multiplier: 3,
			oneIn: 400,
			toolLuck: .75,
			points: 10
		},
		{
			name: "Epic",
			gameName: "Epic",
			multiplier: 8,
			oneIn: 8e3,
			toolLuck: 2,
			points: 30
		},
		{
			name: "Legendary",
			gameName: "Legendary",
			multiplier: 25,
			oneIn: 15e4,
			toolLuck: 5,
			points: 100
		}
	];
	//#endregion
	//#region src/core/xp.js
	function oddsMultiplier(luckPercent, rareFindPercent) {
		return (1 + luckPercent / 100) * (1 + rareFindPercent / 100);
	}
	function rarityChances(odds) {
		const atLeast = RARITIES.map((r) => Math.min(1, odds / r.oneIn));
		return RARITIES.map((r, i) => ({
			...r,
			chance: atLeast[i] - (atLeast[i + 1] ?? 0)
		}));
	}
	function expectedMultiplier(chances) {
		return chances.reduce((sum, r) => sum + r.chance * r.multiplier, 0);
	}
	function failChance(job, level) {
		const f = job.fail;
		if (!f || level >= f.never) return 0;
		if (level <= job.level) return f.chance / 100;
		return f.chance / 100 * (f.never - level) / (f.never - job.level);
	}
	//#endregion
	//#region src/game/collection.js
	var itemName = (job) => job.skill === "Cooking" ? job.name.replace(/^Cook /, "Cooked ") : job.name;
	//#endregion
	//#region src/game/jobs.js
	var SKILL_GROUPS = {
		Gathering: [
			"Mining",
			"Fishing",
			"Woodcutting",
			"Thieving"
		],
		Processing: [
			"Cooking",
			"Smithing",
			"Fletching",
			"Herblore",
			"Crafting"
		]
	};
	var isGathering = (skill) => SKILL_GROUPS.Gathering.includes(skill);
	var METAL_LEVELS = [
		1,
		15,
		30,
		60,
		85
	];
	var METALS$1 = [
		"Bronze",
		"Iron",
		"Steel",
		"Cobalt",
		"Meteoric"
	];
	var WOOD_LEVELS = [
		1,
		15,
		30,
		45,
		60,
		75
	];
	var WOODS$1 = [
		"",
		"Oak",
		"Willow",
		"Maple",
		"Yew",
		"Magic"
	];
	var job = (skill, category, level, name, xp, time, fail) => ({
		skill,
		category,
		level,
		name,
		xp,
		time,
		fail
	});
	var burns = (level) => ({
		chance: 30,
		never: level + 25,
		stun: 0
	});
	var caught = (chance, never, stun) => ({
		chance,
		never,
		stun
	});
	var stall = (level, name, xp, time, fail, drop) => ({
		...job("Thieving", "Stalls", level, name, xp, time, fail),
		stall: true,
		drop
	});
	var drop = (item, oneIn) => ({
		item,
		oneIn
	});
	var metalTier = (skill, category, item, xps, time = 3) => METALS$1.map((m, i) => job(skill, category, METAL_LEVELS[i], `${m} ${item}`, xps[i], time));
	var woodTier = (skill, category, item, xps, time = 3) => WOODS$1.map((w, i) => job(skill, category, WOOD_LEVELS[i], w ? `${w} ${item.toLowerCase()}` : item, xps[i], time));
	var armourSet = (category, material, level, pieces, xps, time) => pieces.map((p, i) => job("Crafting", category, level, `${material} ${p}`, xps[i], time));
	var SMALL = [
		8,
		13,
		41,
		120,
		276
	];
	var MEDIUM = [
		17,
		27,
		83,
		240,
		552
	];
	var LEATHER = [
		"coif",
		"chaps",
		"jerkin"
	];
	var CLOTH = [
		"hood",
		"skirt",
		"robe"
	];
	var JOBS = [
		job("Mining", "", 1, "Copper", 2, 3),
		job("Mining", "", 1, "Tin", 3, 3),
		job("Mining", "", 15, "Iron", 5, 3.6),
		job("Mining", "", 30, "Silver", 9, 4.2),
		job("Mining", "", 40, "Coal", 14, 4.8),
		job("Mining", "", 55, "Gold", 22, 5.4),
		job("Mining", "", 65, "Cobalt", 37, 6.6),
		job("Mining", "", 85, "Meteoric", 59, 7.8),
		job("Fishing", "", 1, "Shrimp", 2, 3),
		job("Fishing", "", 5, "Sardine", 3, 3),
		job("Fishing", "", 20, "Trout", 7, 3.6),
		job("Fishing", "", 30, "Salmon", 11, 4.2),
		job("Fishing", "", 45, "Tuna", 17, 4.8),
		job("Fishing", "", 60, "Lobster", 28, 6),
		job("Fishing", "", 75, "Swordfish", 44, 6.6),
		job("Fishing", "", 90, "Shark", 60, 7.8),
		job("Woodcutting", "", 1, "Tree", 3, 3),
		job("Woodcutting", "", 15, "Oak", 7, 3.6),
		job("Woodcutting", "", 30, "Willow", 11, 4.2),
		job("Woodcutting", "", 45, "Maple", 18, 4.8),
		job("Woodcutting", "", 60, "Yew", 29, 6),
		job("Woodcutting", "", 75, "Magic", 48, 7.2),
		stall(1, "Bread stall", 8, 3.6, caught(25, 30, 4.8)),
		stall(25, "Silk stall", 30, 4.2, caught(30, 60, 6), drop("Nightshade seed", 30)),
		stall(50, "Gem stall", 80, 4.8, caught(32, 85, 7.2), drop("Rough gem", 25)),
		stall(75, "Relic stall", 200, 5.4, caught(35, 110, 9), drop("Voidshard", 33)),
		job("Thieving", "Cloth", 1, "Linen line", 7, 4.2, caught(25, 30, 4.8)),
		job("Thieving", "Cloth", 25, "Silk cart", 26, 4.8, caught(30, 60, 6)),
		job("Thieving", "Cloth", 50, "Gilded loom", 70, 5.4, caught(32, 85, 7.2)),
		job("Thieving", "Cloth", 75, "Reliquary vestry", 175, 6, caught(35, 110, 9)),
		job("Cooking", "", 1, "Cook shrimp", 4, 2.4, burns(1)),
		job("Cooking", "", 5, "Cook sardine", 5, 2.4, burns(5)),
		job("Cooking", "", 20, "Cook trout", 10, 2.4, burns(20)),
		job("Cooking", "", 30, "Cook salmon", 14, 2.4, burns(30)),
		job("Cooking", "", 45, "Cook tuna", 22, 2.4, burns(45)),
		job("Cooking", "", 60, "Cook lobster", 36, 2.4, burns(60)),
		job("Cooking", "", 75, "Cook swordfish", 59, 2.4, burns(75)),
		job("Cooking", "", 90, "Cook shark", 92, 2.4, burns(90)),
		...metalTier("Smithing", "Bars", "bar", [
			6,
			8,
			35,
			108,
			253
		], 2.4),
		...metalTier("Smithing", "Pickaxes", "pickaxe", MEDIUM),
		...metalTier("Smithing", "Pans", "pan", SMALL),
		...metalTier("Smithing", "Hammers", "hammer", MEDIUM),
		...metalTier("Smithing", "Knives", "knife", SMALL),
		...metalTier("Smithing", "Axes", "axe", MEDIUM),
		...metalTier("Smithing", "Weapons", "blade", SMALL),
		...metalTier("Smithing", "Two-handers", "greatsword", MEDIUM),
		...metalTier("Smithing", "Shields", "shield", [
			25,
			40,
			124,
			360,
			828
		]),
		...metalTier("Smithing", "Helmets", "helm", MEDIUM),
		...metalTier("Smithing", "Bodies", "plate", [
			42,
			67,
			207,
			600,
			1380
		]),
		...metalTier("Smithing", "Legs", "greaves", [
			34,
			53,
			165,
			480,
			1104
		]),
		...metalTier("Fletching", "Rods", "rod", SMALL),
		...metalTier("Fletching", "Hoes", "hoe", MEDIUM),
		...woodTier("Fletching", "Shortbows", "Shortbow", [
			5,
			11,
			17,
			27,
			43,
			70
		]),
		...woodTier("Fletching", "Longbows", "Longbow", [
			10,
			22,
			34,
			54,
			86,
			140
		]),
		...woodTier("Fletching", "Staffs", "Staff", [
			8,
			22,
			40,
			65,
			100,
			150
		]),
		job("Fletching", "Quivers", 1, "Pelt quiver", 14, 3),
		job("Fletching", "Quivers", 15, "Bogskin quiver", 34, 3),
		job("Fletching", "Quivers", 30, "Chitin quiver", 70, 3),
		job("Fletching", "Quivers", 60, "Fur quiver", 150, 3),
		job("Fletching", "Quivers", 85, "Scale quiver", 320, 3),
		job("Fletching", "Quivers", 95, "Troll quiver", 700, 3.6),
		job("Herblore", "", 1, "Gatherer's draught", 30, 3.6),
		job("Herblore", "", 20, "Swift draught", 70, 3.6),
		job("Herblore", "", 35, "Hunter's brew", 120, 3.6),
		job("Herblore", "", 50, "Nourishing draught", 240, 3.6),
		job("Herblore", "", 60, "Warrior's tonic", 300, 3.6),
		job("Herblore", "", 70, "Haste draught", 460, 4.2),
		job("Herblore", "", 80, "Elixir of the vein", 700, 4.2),
		job("Herblore", "", 95, "Abyssal tonic", 1600, 4.2),
		...metalTier("Crafting", "Needles", "needle", SMALL),
		...metalTier("Crafting", "Mortars", "mortar", MEDIUM),
		job("Crafting", "Gems", 1, "Cut gem", 16, 3),
		job("Crafting", "Rings", 20, "Silver ring", 58, 3.6),
		job("Crafting", "Rings", 45, "Gold ring", 156, 3.6),
		job("Crafting", "Rings", 75, "Meteoric ring", 455, 4.2),
		job("Crafting", "Rings", 95, "Wyrm ring", 1200, 4.8),
		job("Crafting", "Amulets", 30, "Silver amulet", 84, 3.6),
		job("Crafting", "Amulets", 55, "Gold amulet", 221, 3.6),
		job("Crafting", "Amulets", 85, "Meteoric amulet", 618, 4.2),
		job("Crafting", "Amulets", 95, "Leviathan amulet", 1400, 4.8),
		...armourSet("Leather", "Pelt", 1, LEATHER, [
			8,
			12,
			20
		], 3.6),
		...armourSet("Leather", "Bogskin", 15, LEATHER, [
			22,
			33,
			55
		], 3.6),
		...armourSet("Leather", "Chitin", 30, LEATHER, [
			60,
			90,
			150
		], 3.6),
		...armourSet("Leather", "Fur", 60, LEATHER, [
			180,
			270,
			450
		], 4.2),
		...armourSet("Leather", "Scale", 85, LEATHER, [
			460,
			690,
			1150
		], 4.2),
		...armourSet("Leather", "Troll", 95, LEATHER, [
			1250,
			1900,
			3100
		], 4.8),
		...armourSet("Cloth", "Homespun", 1, CLOTH, [
			9,
			14,
			23
		], 3.6),
		...armourSet("Cloth", "Silk", 25, CLOTH, [
			50,
			75,
			125
		], 3.6),
		...armourSet("Cloth", "Gilded", 50, CLOTH, [
			145,
			215,
			360
		], 4.2),
		...armourSet("Cloth", "Voidweave", 75, CLOTH, [
			380,
			570,
			950
		], 4.2),
		...armourSet("Cloth", "Wightweave", 90, CLOTH, [
			1e3,
			1500,
			2500
		], 4.8),
		job("Crafting", "Gloves", 5, "Pelt gloves", 10, 3.6),
		job("Crafting", "Gloves", 25, "Bogskin gloves", 28, 3.6),
		job("Crafting", "Gloves", 45, "Chitin gloves", 75, 3.6),
		job("Crafting", "Gloves", 65, "Bone gloves", 225, 4.2),
		job("Crafting", "Gloves", 85, "Scale gloves", 575, 4.2),
		job("Crafting", "Grimoires", 1, "Linen grimoire", 16, 3.6),
		job("Crafting", "Grimoires", 25, "Silk grimoire", 85, 3.6),
		job("Crafting", "Grimoires", 50, "Gilded grimoire", 230, 4.2),
		job("Crafting", "Grimoires", 75, "Voidweave grimoire", 560, 4.2),
		job("Crafting", "Grimoires", 90, "Wightweave grimoire", 1200, 4.8)
	].map((j, id) => ({
		...j,
		id
	}));
	//#endregion
	//#region src/game/recipes.js
	var METALS = [
		"Bronze",
		"Iron",
		"Steel",
		"Cobalt",
		"Meteoric"
	];
	var METAL_LOGS = [
		"Logs",
		"Oak logs",
		"Willow logs",
		"Yew logs",
		"Magic logs"
	];
	var WOODS = [
		"",
		"Oak",
		"Willow",
		"Maple",
		"Yew",
		"Magic"
	];
	var logs = (wood) => wood ? `${wood} logs` : "Logs";
	var BARS = {
		"Bronze bar": [[1, "Copper"], [1, "Tin"]],
		"Iron bar": [[1, "Iron"]],
		"Steel bar": [[1, "Iron"], [2, "Coal"]],
		"Cobalt bar": [[1, "Cobalt"], [3, "Coal"]],
		"Meteoric bar": [[1, "Meteoric"], [4, "Coal"]]
	};
	var BAR_ITEMS = {
		Smithing: {
			pickaxe: 2,
			axe: 2,
			blade: 1,
			shield: 3,
			helm: 2,
			plate: 5,
			greaves: 4,
			pan: 1,
			hammer: 2,
			knife: 1,
			greatsword: 2
		},
		Crafting: {
			needle: 1,
			mortar: 2
		}
	};
	var HIDES = {
		Pelt: "Gnawer pelt",
		Bogskin: "Bogling skin",
		Chitin: "Husk chitin",
		Fur: "Rimewolf fur",
		Scale: "Ember scale",
		Troll: "Troll hide"
	};
	var BOLTS = {
		Homespun: "Homespun bolt",
		Silk: "Silk bolt",
		Gilded: "Gilded bolt",
		Voidweave: "Voidweave bolt"
	};
	var PIECES = {
		coif: 2,
		chaps: 3,
		jerkin: 5,
		hood: 2,
		skirt: 3,
		robe: 5
	};
	({
		...BARS,
		...Object.fromEntries(Object.values(BAR_ITEMS).flatMap((items) => Object.entries(items).flatMap(([item, n]) => METALS.map((m) => [`${m} ${item}`, [[n, `${m} bar`]]])))),
		...Object.fromEntries(METALS.flatMap((m, i) => [[`${m} rod`, [[1, `${m} bar`], [1, METAL_LOGS[i]]]], [`${m} hoe`, [[1, `${m} bar`], [2, METAL_LOGS[i]]]]])),
		...Object.fromEntries(WOODS.flatMap((w) => [
			[w ? `${w} shortbow` : "Shortbow", [[1, logs(w)]]],
			[w ? `${w} longbow` : "Longbow", [[2, logs(w)]]],
			[w ? `${w} staff` : "Staff", [[2, logs(w)]]]
		]))
	}), { ...Object.fromEntries(Object.entries({
		...HIDES,
		...BOLTS
	}).flatMap(([set, material]) => Object.entries(PIECES).map(([piece, n]) => [`${set} ${piece}`, [[n, material]]]))) }, { ...Object.fromEntries(JOBS.filter((j) => j.skill === "Cooking").map((j) => {
		const fish = j.name.replace(/^Cook /, "");
		return [j.name, [[1, fish[0].toUpperCase() + fish.slice(1)]]];
	})) };
	var COMMON_ONLY = ["Coal"];
	//#endregion
	//#region src/game/xpSources.js
	var SCOPES = [{
		match: /^home\b|\(combat\)/i,
		appliesTo: "combat only",
		applies: () => false
	}, {
		match: /^gatherer/i,
		appliesTo: "gathering skills",
		applies: (skill) => isGathering(skill)
	}];
	var ALL = {
		appliesTo: "all skills",
		applies: () => true
	};
	var xpSourceScope = (label) => SCOPES.find((s) => s.match.test(label)) ?? ALL;
	//#endregion
	//#region src/profile/xpGain.js
	function xpGainDeductions(profile, skill) {
		return (profile.xpGainSources ?? []).filter((s) => !xpSourceScope(s.label).applies(skill));
	}
	function skillXpGain(profile, skill) {
		return xpGainDeductions(profile, skill).reduce((gain, s) => gain - s.value, profile.xpGain);
	}
	var MISSING_XP_SOURCES = "XP gain was imported without its sources, so it may include bonuses that don't apply to these skills (e.g. Home (combat)). Import again: open the stats menu in the game for the userscript, or click \"XP gain\" on the stats page before copying.";
	//#endregion
	//#region src/import/stats.js
	var ALL_SKILLS = [...SKILL_GROUPS.Gathering, ...SKILL_GROUPS.Processing];
	var NOT_AN_XP_SOURCE = /^(luck\b|rare-find|max hit|attack speed|move speed|food healing|enhance odds)|speed$/i;
	function htmlPairs(html) {
		return [...new DOMParser().parseFromString(html, "text/html").querySelectorAll(".stats-bonus-head, .stats-src > span")].flatMap((el) => {
			const valueEl = el.querySelector("b");
			if (!valueEl) return [];
			const value = parseFloat(valueEl.textContent);
			const label = el.textContent.slice(0, -valueEl.textContent.length).trim();
			return label && Number.isFinite(value) ? [[label, value]] : [];
		});
	}
	function statPairs(text) {
		if (text.trimStart().startsWith("<")) return htmlPairs(text);
		const pairs = [];
		let label = null;
		for (const raw of text.split(/\r?\n/)) {
			const line = raw.trim();
			if (!line) continue;
			const m = line.match(/^(.*?)\s*([+-]?\d+(?:\.\d+)?)\s*%$/);
			if (m && m[1]) pairs.push([m[1], Number(m[2])]);
			else if (m && label) pairs.push([label, Number(m[2])]);
			label = m ? null : line;
		}
		return pairs;
	}
	function parseStats(text) {
		const result = {
			luck: {},
			speed: {}
		};
		const found = [];
		let sources = null;
		let luckElsewhere;
		for (const [label, v] of statPairs(text)) {
			const lower = label.toLowerCase();
			if (lower === "xp gain") {
				result.xpGain = v;
				sources = [];
				continue;
			}
			if (sources && !NOT_AN_XP_SOURCE.test(label)) {
				sources.push({
					label,
					value: v
				});
				continue;
			}
			if (sources) {
				result.xpGainSources = sources;
				sources = null;
			}
			if (lower === "rare-find") result.rareFind = v;
			else if (lower === "luck elsewhere") luckElsewhere = v;
			else if (lower.startsWith("luck in ")) {
				const skill = matchSkill(label.slice(8));
				if (skill) result.luck[skill] = v;
			} else if (lower.endsWith(" speed")) {
				const skill = matchSkill(label.slice(0, -6));
				if (skill) result.speed[skill] = v;
			}
		}
		if (sources) result.xpGainSources = sources;
		if (luckElsewhere !== void 0) for (const s of SKILL_GROUPS.Gathering) result.luck[s] ??= luckElsewhere;
		if (result.xpGain !== void 0) {
			const n = result.xpGainSources?.length;
			found.push(`XP gain ${result.xpGain}%${n ? ` (${n} sources)` : ""}`);
		}
		if (result.rareFind !== void 0) found.push(`Rare-find ${result.rareFind}%`);
		const luckCount = Object.keys(result.luck).length;
		const speedCount = Object.keys(result.speed).length;
		if (luckCount) found.push(`luck for ${luckCount} skills`);
		if (speedCount) found.push(`speed for ${speedCount} skills`);
		if (!luckCount) delete result.luck;
		if (!speedCount) delete result.speed;
		return {
			settings: result,
			found,
			warning: result.xpGain !== void 0 && !result.xpGainSources?.length ? MISSING_XP_SOURCES : void 0
		};
	}
	var matchSkill = (name, skills = ALL_SKILLS) => skills.find((s) => s.toLowerCase() === name.toLowerCase());
	//#endregion
	//#region \0item-ids
	var _item_ids_default = {
		"copper": 1,
		"logs": 10,
		"roughgem": 100,
		"oaklogs": 11,
		"bronzeblade": 110,
		"ironblade": 111,
		"steelblade": 112,
		"cobaltblade": 113,
		"meteoricblade": 114,
		"bronzeshield": 115,
		"ironshield": 116,
		"steelshield": 117,
		"cobaltshield": 118,
		"meteoricshield": 119,
		"willowlogs": 12,
		"bronzehelm": 120,
		"ironhelm": 121,
		"steelhelm": 122,
		"cobalthelm": 123,
		"meteorichelm": 124,
		"bronzeplate": 125,
		"ironplate": 126,
		"steelplate": 127,
		"cobaltplate": 128,
		"meteoricplate": 129,
		"maplelogs": 13,
		"bronzegreaves": 130,
		"irongreaves": 131,
		"steelgreaves": 132,
		"cobaltgreaves": 133,
		"meteoricgreaves": 134,
		"yewlogs": 14,
		"shortbow": 140,
		"oakshortbow": 141,
		"willowshortbow": 142,
		"mapleshortbow": 143,
		"yewshortbow": 144,
		"magicshortbow": 145,
		"longbow": 146,
		"oaklongbow": 147,
		"willowlongbow": 148,
		"maplelongbow": 149,
		"magiclogs": 15,
		"yewlongbow": 150,
		"magiclongbow": 151,
		"staff": 152,
		"oakstaff": 153,
		"willowstaff": 154,
		"maplestaff": 155,
		"yewstaff": 156,
		"magicstaff": 157,
		"potatoseed": 160,
		"glowcapspore": 161,
		"turnipseed": 162,
		"bitterrootseed": 163,
		"voidmelonseed": 164,
		"pepperseed": 165,
		"potato": 170,
		"glowcap": 171,
		"caveturnip": 172,
		"bitterroot": 173,
		"voidmelon": 174,
		"emberpepper": 175,
		"cutgem": 180,
		"silverring": 181,
		"goldring": 182,
		"meteoricring": 183,
		"silveramulet": 184,
		"goldamulet": 185,
		"meteoricamulet": 186,
		"sageseed": 190,
		"nightshadeseed": 191,
		"dragonleafseed": 192,
		"sage": 193,
		"nightshade": 194,
		"dragonleaf": 195,
		"tin": 2,
		"shrimp": 20,
		"gnawedcharm": 201,
		"bogpearl": 202,
		"drysigil": 203,
		"cairntoken": 204,
		"rimefang": 205,
		"emberheart": 206,
		"abyssaleye": 207,
		"voidshard": 208,
		"gravemawskull": 209,
		"sardine": 21,
		"hollowcrown": 210,
		"riftborneheart": 211,
		"colossuscore": 212,
		"wraithash": 213,
		"stalkerfang": 214,
		"trolltusk": 215,
		"wightcrown": 216,
		"drakescale": 217,
		"colossusember": 218,
		"trout": 22,
		"gatherersdraught": 220,
		"huntersbrew": 221,
		"warriorstonic": 222,
		"elixirofthevein": 223,
		"abyssaltonic": 224,
		"swiftdraught": 225,
		"nourishingdraught": 226,
		"hastedraught": 227,
		"salmon": 23,
		"tuna": 24,
		"gnawerpelt": 240,
		"boglingskin": 241,
		"huskchitin": 242,
		"cairnbone": 243,
		"wraithdust": 244,
		"rimewolffur": 245,
		"stalkerclaw": 246,
		"emberscale": 247,
		"trollhide": 248,
		"horrorichor": 249,
		"lobster": 25,
		"icewightshard": 250,
		"drakehide": 251,
		"colossuschip": 252,
		"swordfish": 26,
		"peltcoif": 260,
		"peltjerkin": 261,
		"peltchaps": 262,
		"bogskincoif": 263,
		"bogskinjerkin": 264,
		"bogskinchaps": 265,
		"chitincoif": 266,
		"chitinjerkin": 267,
		"chitinchaps": 268,
		"furcoif": 269,
		"shark": 27,
		"furjerkin": 270,
		"furchaps": 271,
		"scalecoif": 272,
		"scalejerkin": 273,
		"scalechaps": 274,
		"gempack": 293,
		"iron": 3,
		"homespunbolt": 300,
		"silkbolt": 301,
		"gildedbolt": 302,
		"voidweavebolt": 303,
		"homespunhood": 304,
		"homespunrobe": 305,
		"homespunskirt": 306,
		"silkhood": 307,
		"silkrobe": 308,
		"silkskirt": 309,
		"gildedhood": 310,
		"gildedrobe": 311,
		"gildedskirt": 312,
		"voidweavehood": 313,
		"voidweaverobe": 314,
		"voidweaveskirt": 315,
		"peltgloves": 323,
		"bogskingloves": 324,
		"chitingloves": 325,
		"bonegloves": 326,
		"scalegloves": 327,
		"horse": 328,
		"peltquiver": 329,
		"bogskinquiver": 330,
		"chitinquiver": 331,
		"furquiver": 332,
		"scalequiver": 333,
		"linengrimoire": 334,
		"silkgrimoire": 335,
		"gildedgrimoire": 336,
		"voidweavegrimoire": 337,
		"trollcoif": 338,
		"trolljerkin": 339,
		"trollchaps": 340,
		"drakecoif": 341,
		"drakejerkin": 342,
		"drakechaps": 343,
		"wightweavehood": 344,
		"wightweaverobe": 345,
		"wightweaveskirt": 346,
		"trollquiver": 347,
		"drakequiver": 348,
		"wightweavegrimoire": 349,
		"colossusblade": 350,
		"colossusshield": 351,
		"colossushelm": 352,
		"colossusplate": 353,
		"colossusgreaves": 354,
		"leviathanscale": 355,
		"wyrmember": 356,
		"leviathanamulet": 357,
		"wyrmring": 358,
		"protectionscroll": 359,
		"bronzepan": 360,
		"ironpan": 361,
		"steelpan": 362,
		"cobaltpan": 363,
		"meteoricpan": 364,
		"bronzehammer": 365,
		"ironhammer": 366,
		"steelhammer": 367,
		"cobalthammer": 368,
		"meteorichammer": 369,
		"bronzeknife": 370,
		"ironknife": 371,
		"steelknife": 372,
		"cobaltknife": 373,
		"meteoricknife": 374,
		"bronzeneedle": 375,
		"ironneedle": 376,
		"steelneedle": 377,
		"cobaltneedle": 378,
		"meteoricneedle": 379,
		"bronzemortar": 380,
		"ironmortar": 381,
		"steelmortar": 382,
		"cobaltmortar": 383,
		"meteoricmortar": 384,
		"bronzehoe": 385,
		"ironhoe": 386,
		"steelhoe": 387,
		"cobalthoe": 388,
		"meteorichoe": 389,
		"bronzegreatsword": 390,
		"irongreatsword": 391,
		"steelgreatsword": 392,
		"cobaltgreatsword": 393,
		"meteoricgreatsword": 394,
		"colossusgreatsword": 395,
		"goldenweekgiftbox": 396,
		"moonbox": 397,
		"silver": 4,
		"bronzebar": 40,
		"ironbar": 41,
		"steelbar": 42,
		"cobaltbar": 43,
		"meteoricbar": 44,
		"coal": 5,
		"gold": 6,
		"cookedshrimp": 60,
		"cookedsardine": 61,
		"cookedtrout": 62,
		"drakestringshortbow": 629,
		"cookedsalmon": 63,
		"drakestringlongbow": 630,
		"emberwoodstaff": 631,
		"abyssweavehood": 632,
		"abyssweaverobe": 633,
		"abyssweaveskirt": 634,
		"abyssweavegrimoire": 635,
		"cookedtuna": 64,
		"cookedlobster": 65,
		"cookedswordfish": 66,
		"cookedshark": 67,
		"cobalt": 7,
		"burntfood": 70,
		"meteoric": 8,
		"bronzepickaxe": 80,
		"ironpickaxe": 81,
		"steelpickaxe": 82,
		"cobaltpickaxe": 83,
		"meteoricpickaxe": 84,
		"bronzerod": 85,
		"ironrod": 86,
		"steelrod": 87,
		"cobaltrod": 88,
		"meteoricrod": 89,
		"bronzeaxe": 90,
		"ironaxe": 91,
		"steelaxe": 92,
		"cobaltaxe": 93,
		"meteoricaxe": 94
	};
	//#endregion
	//#region userscripts/profit/main.js
	var SETTINGS_KEY = "careless-profit-settings";
	var PRICES_KEY = "careless-profit-prices";
	var STATS_KEY = "careless-profit-stats";
	var DEFAULT_SETTINGS = {
		price: "bid",
		tax: true,
		unit: "hour"
	};
	var IGNORE_MISSING_BELOW = .01;
	var PRICE_FEED_URL = "/api/market/prices.json";
	var PRICE_FEED_REFRESH_MS = 3e5;
	var STATS_CHECK_MS = 5e3;
	var STATS_PEEK_MS = 3e3;
	var page = unsafeWindow;
	var state = {
		settings: { ...DEFAULT_SETTINGS },
		prices: {
			items: {},
			capturedAt: null,
			source: null
		},
		taxBp: 0,
		bank: {},
		stats: null
	};
	async function load() {
		state.settings = {
			...DEFAULT_SETTINGS,
			...await GM_getValue(SETTINGS_KEY, null) ?? {}
		};
		state.prices = await GM_getValue(PRICES_KEY, null) ?? state.prices;
		state.stats = await GM_getValue(STATS_KEY, null);
		render();
	}
	var pricesSaveTimer;
	function savePricesSoon() {
		clearTimeout(pricesSaveTimer);
		pricesSaveTimer = setTimeout(() => GM_setValue(PRICES_KEY, state.prices), 1e3);
	}
	var liveMarketSeen = false;
	async function loadPriceFeed() {
		if (liveMarketSeen) return;
		try {
			const response = await fetch(PRICE_FEED_URL, { cache: "no-store" });
			if (!response.ok) throw Error(`HTTP ${response.status}`);
			const feed = await response.json();
			const at = Date.parse(feed.generatedAt) || Date.now();
			if (liveMarketSeen || (state.prices.capturedAt ?? 0) >= at) return;
			const items = {};
			for (const [id, item] of Object.entries(feed.items ?? {})) items[id] = [item?.lowestSell || 0, item?.highestBuy || 0];
			state.prices = {
				items,
				capturedAt: at,
				source: "feed"
			};
			savePricesSoon();
			render();
		} catch (error) {
			console.warn("[Careless Tools profit] price feed unavailable:", error.message);
		}
	}
	function onFrame(raw) {
		let f;
		try {
			f = JSON.parse(raw);
		} catch {
			return;
		}
		if (!Array.isArray(f?.m)) return;
		let changed = false;
		for (const m of f.m) {
			if (m?.t === "welcome" && Number.isFinite(m.marketTaxBp)) state.taxBp = m.marketTaxBp;
			if ((m?.t === "welcome" || m?.t === "snapshot") && m.you) {
				state.bank = storageFrom(m.you);
				changed = true;
				startPeeking();
			}
			if (m?.t === "marketStock" && Array.isArray(m.summary)) {
				const items = {};
				for (const [id, ask, bid] of m.summary) items[id] = [ask || 0, bid || 0];
				state.prices = {
					items,
					capturedAt: Date.now(),
					source: "market"
				};
				liveMarketSeen = true;
				savePricesSoon();
				changed = true;
			}
			const tops = m?.t === "marketBooks" ? m.tops : m?.t === "marketBook" ? [m.top] : [];
			for (const top of Array.isArray(tops) ? tops : []) {
				if (!Number.isSafeInteger(top?.itemId)) continue;
				state.prices.items[top.itemId] = [top.ask || 0, top.bid || 0];
				state.prices.capturedAt = Date.now();
				savePricesSoon();
				changed = true;
			}
		}
		if (changed) render();
	}
	function storageFrom(you) {
		const bank = {};
		const add = (id, qty) => {
			if (Number.isFinite(qty) && qty > 0) bank[id] = (bank[id] ?? 0) + qty;
		};
		for (const store of [
			you.bank,
			you.overflow,
			you.homeBank
		]) if (store && typeof store === "object") for (const [id, qty] of Object.entries(store)) add(+id, qty);
		for (const slot of Array.isArray(you.pack) ? you.pack : []) add(slot?.itemId, slot?.qty);
		return bank;
	}
	var NativeSocket = page.WebSocket;
	page.WebSocket = new Proxy(NativeSocket, { construct(target, args) {
		const socket = Reflect.construct(target, args);
		const url = new URL(String(args[0]), location.href);
		if (url.host === location.host && url.pathname === "/ws") socket.addEventListener("message", (event) => {
			if (typeof event.data === "string") onFrame(event.data);
		});
		return socket;
	} });
	var lastStatsHtml;
	function captureStats() {
		const group = [...document.querySelectorAll(".stats-group")].find((g) => g.querySelector(".stats-bonus"));
		if (!group || group.outerHTML === lastStatsHtml) return;
		lastStatsHtml = group.outerHTML;
		const { settings } = parseStats(lastStatsHtml);
		if (settings.xpGain === void 0) return;
		state.stats = {
			profile: {
				luck: {},
				...settings
			},
			capturedAt: Date.now()
		};
		GM_setValue(STATS_KEY, state.stats);
		render();
	}
	setInterval(captureStats, STATS_CHECK_MS);
	var peeked = false;
	function startPeeking() {
		if (peeked) return;
		peeked = true;
		setTimeout(peekStats, STATS_PEEK_MS);
	}
	function peekStats() {
		const veil = document.querySelector("[data-stats]");
		if (lastStatsHtml || !veil || !veil.hidden) return;
		veil.style.setProperty("visibility", "hidden", "important");
		veil.hidden = false;
		let ended = false;
		const end = () => {
			if (ended) return;
			ended = true;
			clearTimeout(timer);
			document.removeEventListener("pointerdown", end, true);
			document.removeEventListener("keydown", end, true);
			captureStats();
			veil.hidden = true;
			veil.style.removeProperty("visibility");
		};
		const timer = setTimeout(end, STATS_PEEK_MS);
		document.addEventListener("pointerdown", end, true);
		document.addEventListener("keydown", end, true);
	}
	var normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
	var itemId = (name, rarityIndex) => {
		const base = _item_ids_default[normalize(name)];
		return base === void 0 ? void 0 : base + 1e3 * rarityIndex;
	};
	function value(name, rarityIndex) {
		if (normalize(name) === "coins") return 1;
		const price = state.prices.items[itemId(name, rarityIndex)]?.[state.settings.price === "ask" ? 0 : 1];
		if (!price) return null;
		return state.settings.tax ? price * (1 - state.taxBp / 1e4) : price;
	}
	function rolledValue(name, chances, perAction = 1) {
		let total = 0;
		const missing = [];
		for (const [i, r] of chances.entries()) {
			if (r.chance <= 0) continue;
			const v = value(name, i);
			if (v === null) {
				if (r.chance * perAction >= IGNORE_MISSING_BELOW) return null;
				missing.push(r.name);
				continue;
			}
			total += r.chance * v;
		}
		return {
			value: total,
			missing
		};
	}
	var num = (text) => Number(String(text).replace(/,/g, ""));
	function parseTip(lines) {
		const parts = (lines ?? "").split("|");
		const main = parts[0]?.match(/^Each [^:]+:\s*([\d,]+)×\s*(.+?)\s*·/);
		const drops = parts.slice(1).map((p) => p.match(/^(.+?):\s*1 in ([\d,]+)$/)).filter((m) => m && !m[1].startsWith("Pet")).map((m) => ({
			item: m[1].trim(),
			oneIn: num(m[2])
		}));
		return {
			output: main ? {
				qty: num(main[1]),
				item: main[2]
			} : null,
			drops
		};
	}
	function parseCost(title) {
		const list = (title ?? "").split(" · ")[0];
		if (!list) return [];
		return list.split(" + ").map((part) => {
			const m = part.trim().match(/^(\d+)\s+(.+)$/);
			return m ? {
				qty: +m[1],
				item: m[2]
			} : {
				qty: 1,
				item: part.trim()
			};
		});
	}
	var materialRarity = (item, rarityIndex) => COMMON_ONLY.includes(item) ? 0 : rarityIndex;
	function craftingRarity(rows) {
		const picked = document.querySelector("[data-rarity-choices] button[aria-pressed=\"true\"]");
		if (!picked) return 0;
		if (picked.dataset.rarity !== void 0) return +picked.dataset.rarity;
		for (let r = RARITIES.length - 1; r > 0; r--) if (rows.some(({ cost }) => cost.length > 0 && cost.every(({ qty, item }) => (state.bank[itemId(item, materialRarity(item, r))] ?? 0) >= qty))) return r;
		return 0;
	}
	function gatheringProfit(job, row, profile, skill, level) {
		const { output, drops } = parseTip(row.tip);
		if (!output) return null;
		const chances = rarityChances(oddsMultiplier(profile.luck?.[skill] ?? 0, profile.rareFind ?? 0));
		const gain = 1 + skillXpGain(profile, skill) / 100;
		const xpPerSuccess = job.xp * (job.stall ? 1 : expectedMultiplier(chances)) * gain;
		const successes = row.xpPerHour / xpPerSuccess;
		const attempts = successes / (1 - failChance(job, level));
		const missing = [];
		const main = normalize(output.item) === "coins" ? {
			value: 1,
			missing: []
		} : rolledValue(output.item, chances);
		if (!main) return null;
		missing.push(...main.missing.map((r) => `${r} ${output.item}`));
		let perSuccess = output.qty * main.value;
		for (const d of drops) {
			const v = rolledValue(d.item, chances, 1 / d.oneIn);
			if (!v) return null;
			missing.push(...v.missing.map((r) => `${r} ${d.item}`));
			perSuccess += v.value / d.oneIn;
		}
		const lines = [`${output.qty}× ${output.item}`, ...drops.map((d) => `${d.item}: 1 in ${d.oneIn}`)];
		return {
			perHour: successes * perSuccess,
			attempts,
			missing,
			lines
		};
	}
	function craftingProfit(job, row, profile, skill, level, rarityIndex) {
		if (!row.cost.length) return null;
		const outValue = value(itemName(job), rarityIndex);
		if (outValue === null) return null;
		let inValue = 0;
		for (const { qty, item } of row.cost) {
			const v = value(item, materialRarity(item, rarityIndex));
			if (v === null) return null;
			inValue += qty * v;
		}
		const gain = 1 + skillXpGain(profile, skill) / 100;
		const successes = row.xpPerHour / (job.xp * RARITIES[rarityIndex].multiplier * gain);
		const attempts = successes / (1 - failChance(job, level));
		return {
			perHour: successes * outValue - attempts * inValue,
			attempts,
			missing: [],
			lines: [`${RARITIES[rarityIndex].name}: ${row.cost.map((c) => `${c.qty} ${c.item}`).join(" + ")}`]
		};
	}
	var compact = new Intl.NumberFormat("en", {
		notation: "compact",
		maximumFractionDigits: 1
	});
	var UNITS = {
		hour: ["/h", 1],
		day: ["/d", 24],
		action: ["/action", null]
	};
	function label(result) {
		const [suffix, factor] = UNITS[state.settings.unit];
		const amount = factor === null ? result.perHour / result.attempts : result.perHour * factor;
		const text = Math.abs(amount) < 100 ? amount.toFixed(1) : compact.format(amount);
		return `${amount > 0 ? "+" : ""}${text}${suffix}`;
	}
	function tooltip(result) {
		const lines = [
			...result.lines,
			`≈ ${compact.format(result.attempts)} actions/h`,
			`${compact.format(result.perHour)} coins/h · ${compact.format(result.perHour * 24)} coins/day`
		];
		if (result.missing.length) lines.push(`No price, left out: ${result.missing.join(", ")}`);
		if (state.prices.capturedAt) {
			const from = state.prices.source === "feed" ? " (price feed)" : "";
			lines.push(`Prices from ${new Date(state.prices.capturedAt).toLocaleString()}${from}`);
		}
		return lines.join("\n");
	}
	var renderQueued = false;
	function render() {
		if (renderQueued) return;
		renderQueued = true;
		requestAnimationFrame(() => {
			renderQueued = false;
			annotate();
		});
	}
	function annotate() {
		for (const list of document.querySelectorAll("[data-routes]")) {
			const heading = list.querySelector(".route-heading")?.textContent.match(/^(.*?)\s+(\d+)$/);
			if (!heading) continue;
			const [, skill, levelText] = heading;
			const level = +levelText;
			const rows = [...list.querySelectorAll("button.route")].map((el) => ({
				el,
				name: el.querySelector(".route-name")?.textContent.trim(),
				xpPerHour: num(el.querySelector(".route-meta")?.textContent.match(/([\d,]+)\s*xp\/h/)?.[1] ?? NaN),
				tip: el.querySelector(".route-drops:not(.route-where):not(.route-order)")?.dataset.tipLines,
				cost: parseCost(el.querySelector(".route-cost")?.title)
			}));
			const rarity = isGathering(skill) ? 0 : craftingRarity(rows.filter((r) => r.xpPerHour > 0));
			const profile = state.stats?.profile;
			for (const row of rows) {
				const job = JOBS.find((j) => j.skill === skill && (j.name === row.name || itemName(j) === row.name));
				let result = null;
				if (job && profile && row.xpPerHour > 0) result = isGathering(skill) ? gatheringProfit(job, row, profile, skill, level) : craftingProfit(job, row, profile, skill, level, rarity);
				show(row.el, result);
			}
		}
	}
	function show(el, result) {
		let span = el.querySelector(".careless-profit");
		if (!result || !Number.isFinite(result.perHour)) {
			span?.remove();
			return;
		}
		if (!span) {
			span = document.createElement("span");
			span.className = "careless-profit";
			el.querySelector(".route-meta")?.after(span);
		}
		const text = label(result);
		const title = tooltip(result);
		const tone = result.perHour > 0 ? "up" : result.perHour < 0 ? "down" : "";
		if (span.textContent !== text) span.textContent = text;
		if (span.title !== title) span.title = title;
		if (span.dataset.tone !== tone) span.dataset.tone = tone;
	}
	new MutationObserver(render).observe(document, {
		childList: true,
		subtree: true,
		characterData: true
	});
	function settingsPanel() {
		const age = (t) => t ? `${Math.round((Date.now() - t) / 6e4)} min ago` : "not yet";
		const s = state.settings;
		const radio = (name, v, text) => `<label><input type="radio" name="${name}" value="${v}"${s[name] === v ? " checked" : ""}> ${text}</label>`;
		return `
    <strong>Careless Tools · Profit</strong>
    <fieldset><legend>Price</legend>
      ${radio("price", "bid", "Sell now (highest buy order)")}
      ${radio("price", "ask", "List it (lowest sell order)")}
    </fieldset>
    <label><input type="checkbox" name="tax"${s.tax ? " checked" : ""}> Take off market tax (${state.taxBp / 100}%)</label>
    <fieldset><legend>Show</legend>
      ${radio("unit", "hour", "Per hour")}
      ${radio("unit", "day", "Per day")}
      ${radio("unit", "action", "Per action")}
    </fieldset>
    <small>Prices: ${Object.keys(state.prices.items).length} items, ${age(state.prices.capturedAt)}${state.prices.source === "feed" ? " (price feed, updates every 5 min)" : ""}.<br>Open the market for live prices.<br>
      Bonuses: ${age(state.stats?.capturedAt)}.</small>`;
	}
	function mountSettings() {
		if (document.getElementById("careless-profit-settings")) return;
		const style = document.createElement("style");
		style.textContent = `
    .careless-profit { margin-left: 6px; font-size: 0.85em; opacity: 0.9; }
    .careless-profit[data-tone="up"] { color: #8fd47e; }
    .careless-profit[data-tone="down"] { color: #e0846f; }
    #careless-profit-settings { position: fixed; right: 8px; bottom: 8px; z-index: 99998; font: 12px sans-serif; color: #e6d6ae; }
    #careless-profit-settings > button { padding: 4px 8px; border: 1px solid #756440; border-radius: 6px; background: #171c24; color: inherit; cursor: pointer; }
    #careless-profit-settings .panel { position: absolute; right: 0; bottom: calc(100% + 6px); display: flex; flex-direction: column; gap: 8px;
      min-width: 240px; padding: 10px; border: 1px solid #756440; border-radius: 6px; background: #171c24; }
    #careless-profit-settings fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 2px; }
    #careless-profit-settings legend { padding: 0 0 2px; opacity: 0.8; }
    #careless-profit-settings small { opacity: 0.8; line-height: 1.4; }`;
		document.head.append(style);
		const root = document.createElement("div");
		root.id = "careless-profit-settings";
		root.innerHTML = "<button type=\"button\" title=\"Careless Tools profit settings\">Profit ⚙</button>";
		const button = root.querySelector("button");
		let panel = null;
		const close = () => {
			panel?.remove();
			panel = null;
		};
		button.addEventListener("click", () => {
			if (panel) return close();
			panel = document.createElement("div");
			panel.className = "panel";
			panel.innerHTML = settingsPanel();
			panel.addEventListener("change", (e) => {
				const { name, type, value: v, checked } = e.target;
				state.settings = {
					...state.settings,
					[name]: type === "checkbox" ? checked : v
				};
				GM_setValue(SETTINGS_KEY, state.settings);
				render();
			});
			root.append(panel);
		});
		document.addEventListener("pointerdown", (e) => panel && !root.contains(e.target) && close());
		document.body.append(root);
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountSettings);
	else mountSettings();
	load().then(loadPriceFeed);
	setInterval(loadPriceFeed, PRICE_FEED_REFRESH_MS);
	//#endregion
})();
