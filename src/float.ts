import db from "@inrixia/db";

import { MyPlexAccount } from "@ctrl/plex";
let plexApi: MyPlexAccount;

// (async () => {
// 	const account 
// 	const resource = await account.resource("<SERVERNAME>");
// 	const plex = await resource.connect();
// 	const library = await plex.library();
// 	(await library.section("sectionname")).refresh();
// })();


import Subscription from "./lib/Subscription";

import { loopError, nPad } from "@inrixia/helpers/object";
import { getDistance } from "@inrixia/helpers/geo";

import prompts from "./lib/prompts";

import MultiProgress from "multi-progress";
const multiProgressBar = new MultiProgress(process.stdout);

import { writeableSettings as settings, subChannels, channelAliases } from "./lib/helpers"

import FloatplaneApi from "floatplane"
import type { EdgesResponse } from "floatplane/api"
import { defaultResoulutions } from "./lib/defaults";

import { FileCookieStore } from "tough-cookie-file-store";
import { CookieJar } from "tough-cookie";
import type Video from "./lib/Video";

const cookieJar = new CookieJar(new FileCookieStore("./db/cookies.json"))
const fApi = new FloatplaneApi(cookieJar);

/**
 * Determine the edge closest to the client
 * @param {EdgesResponse} edgesResponse 
 */
const findClosestEdge = (edgesResponse: EdgesResponse) => edgesResponse.edges.filter(edge => edge.allowDownload).reduce((bestEdge, edge) => {
	const distanceToEdge = getDistance([edge.datacenter.latitude, edge.datacenter.longitude], [edgesResponse.client.latitude, edgesResponse.client.longitude]);
	const distanceToBestEdge = getDistance([bestEdge.datacenter.latitude, bestEdge.datacenter.longitude], [edgesResponse.client.latitude, edgesResponse.client.longitude]);
	if (distanceToEdge < distanceToBestEdge) return edge;
	else return bestEdge;
});

/**
 * Main function that triggeres everything else in the script
 */
const start = async () => {
	if (settings.floatplane.findClosestEdge) {
		process.stdout.write("> Finding closest edge server...");
		settings.floatplane.edge = `https://${findClosestEdge(await fApi.api.edges()).hostname}`;
		process.stdout.write(` \u001b[36mFound! Using Server \u001b[0m[\u001b[38;5;208m${settings.floatplane.edge}\u001b[0m]\n`);
	}

	process.stdout.write("> Fetching user subscriptions...");
	const userSubscriptions = await fApi.user.subscriptions()
	process.stdout.write("\u001b[36m Done!\u001b[0m\n\n");

	const videosToDownload: Video[] = []
	for (const subscription of userSubscriptions) {
		// Add the subscription to settings if it doesnt exist
		settings.subscriptions[subscription.creator] ??= {
			creatorId: subscription.creator,
			title: channelAliases[subscription.plan.title.toLowerCase()],
			skip: false,
			channels: subChannels[subscription.plan.title]?.channels
		};

		if (settings.subscriptions[subscription.creator].skip === true) continue;

		const sub = new Subscription(subscription, settings.subscriptions[subscription.creator].channels);
		const lastSeenVideo = sub.lastSeenVideo;

		// Search infinitely if we are resuming. Otherwise only grab the latest `settings.floatplane.videosToSearch` videos
		let videosToSearch = -1;
		if (lastSeenVideo === "") videosToSearch = settings.floatplane.videosToSearch;

		let videosSearched = 0;
		const videos = [];
		process.stdout.write(`> Fetching latest videos from [\u001b[38;5;208m${subscription.plan.title}\u001b[0m]...`);
		for await (const video of fApi.creator.videosIterable(subscription.creator)) {
			if (videosSearched === videosToSearch || video.guid === lastSeenVideo) break;
			videos.push(video);
			videosSearched++;
		}
		process.stdout.write(` Fetched ${videos.length} videos!\n`)
		// Make sure videos are in correct order for episode numbering
		for (const video of videos.sort((a, b) => (+new Date(b.releaseDate)) - (+new Date(a.releaseDate))).map(sub.addVideo)) {
			if (video !== null && !video.isDownloaded()) videosToDownload.push(video)
		}
	}
	console.log("DONE", videosToDownload);
};

// const downloadVideo = video => { // This handles resuming downloads, its very similar to the download function with some changes
// 	let videoSize = videos[video.guid].size ? videos[video.guid].size : 0; // // Set the total size to be equal to the stored total or 0
// 	const videoDownloadedBytes = videos[video.guid].transferred ? videos[video.guid].transferred : 0; // Set previousTransferred as the previous ammount transferred or 0
// 	const fileOptions = { start: videoDownloadedBytes, flags: videos[video.guid].file ? "r+" : "w" };
// 	let displayTitle = "";
// 	// If this video was partially downloaded
// 	if (videos[video.guid].partial) displayTitle = pad(`${colourList[video.subChannel]}${video.subChannel}\u001b[0m> ${video.title.slice(0,35)}`, 36); // Set the title for being displayed and limit it to 25 characters
// 	else displayTitle = pad(`${colourList[video.subChannel]}${video.subChannel}\u001b[0m> ${video.title.slice(0,25)}`, 29); // Set the title for being displayed and limit it to 25 characters
	
// 	const bar = multi.newBar(":title [:bar] :percent :stats", { // Create a new loading bar
// 		complete: "\u001b[42m \u001b[0m",
// 		incomplete: "\u001b[41m \u001b[0m",
// 		width: 30,
// 		total: 100
// 	});
// 	progress(floatRequest({ // Request to download the video
// 		url: video.url,
// 		headers: (videos[video.guid].partial) ? { // Specify the range of bytes we want to download as from the previous ammount transferred to the total, meaning we skip what is already downlaoded
// 			Range: `bytes=${videos[video.guid].transferred}-${videos[video.guid].size}`
// 		} : {}
// 	}), {throttle: settings.downloadUpdateTime}).on("progress", function (state) { // Run the below code every downloadUpdateTime while downloading
// 		if (!videos[video.guid].size) {
// 			videos[video.guid].size = state.size.total;
// 			videos[video.guid].partial = true;
// 			videos[video.guid].file = video.rawPath+video.title+".mp4.part";
// 			saveVideoData();
// 		}
// 		// Set the amount transferred to be equal to the preious ammount plus the new ammount transferred (Since this is a "new" download from the origonal transferred starts at 0 again)
// 		if (state.speed == null) {state.speed = 0;} // If the speed is null set it to 0
// 		bar.update((videoDownloadedBytes+state.size.transferred)/videos[video.guid].size); // Update the bar's percentage with a manually generated one as we cant use progresses one due to this being a partial download
// 		// Tick the bar same as above but the transferred value needs to take into account the previous amount.
// 		bar.tick({"title": displayTitle, "stats": `${((state.speed/100000)/8).toFixed(2)}MB/s ${((videoDownloadedBytes+state.size.transferred)/1024000).toFixed(0)}/${((videoDownloadedBytes+state.size.total)/1024000).toFixed(0)}MB ETA: ${Math.floor(state.time.remaining/60)}m ${Math.floor(state.time.remaining)%60}s`});
// 		videoSize = (videoDownloadedBytes+state.size.total/1024000).toFixed(0); // Update Total for when the download finishes
// 		//savePartialData(); // Save this data
// 	}).on("error", function(err, stdout, stderr) { // On a error log it
// 		if (videos[video.guid].partial) fLog(`Resume > An error occoured for "${video.title}": ${err}`);
// 		else fLog("Download > An error occoured for \""+video.title+"\": "+err);
// 		console.log(`An error occurred: ${err.message} ${err} ${stderr}`);
// 	}).on("end", function () { // When done downloading
// 		fLog(`Download > Finished downloading: "${video.title}"`);
// 		bar.update(1); // Set the progress bar to 100%
// 		// Tick the progress bar to display the totalMB/totalMB
// 		bar.tick({"title": displayTitle, "stats": `${(videoSize/1024000).toFixed(0)}/${(videoSize/1024000).toFixed(0)}MB`});
// 		bar.terminate();
// 		videos[video.guid].partial = false;
// 		videos[video.guid].saved = true;
// 		saveVideoData();
// 		queueCount -= 1; // Reduce queueCount by 1
// 	// Write out the file to the partial file previously saved. But write with read+ and set the starting byte number (Where to start wiriting to the file from) to the previous amount transferred
// 	}).pipe(fs.createWriteStream(video.rawPath+video.title+".mp4.part", fileOptions)).on("finish", function(){ // When done writing out the file
// 		fs.rename(video.rawPath+video.title+".mp4.part", video.rawPath+video.title+".mp4", function(){
// 			videos[video.guid].file = video.rawPath+video.title+".mp4"; // Specifies where the video is saved
// 			saveVideoData();
// 			const temp_file = video.rawPath+"TEMP_"+video.title+".mp4"; // Specify the temp file to write the metadata to
// 			ffmpegFormat(temp_file, video); // Format with ffmpeg for titles/plex support
// 		}); // Rename it without .part
// 	});
// };

const promptFloatplaneLogin = async () => {
	let user = await loopError(async () => fApi.auth.login(await prompts.floatplane.username(), await prompts.floatplane.password()), async err => console.error(`\nLooks like those login details didnt work, Please try again... ${err}`));

	if (user.needs2FA) {
		console.log("Looks like you have 2Factor authentication enabled. Nice!\n");
		user = await loopError(async () => fApi.auth.factor(await prompts.floatplane.token()), async err => console.error(`\nLooks like that 2Factor token didnt work, Please try again... ${err}`));
	}
	console.log(`\nSigned in as ${user.user.username}!\n`);
};

const promptPlexLogin = async () => {
	console.log("\nPlease enter your plex details. (Username and Password is not saved, only used to generate a token.)");
	const username = await prompts.plex.username();
	const password = await prompts.plex.password();
	plexApi = await new MyPlexAccount(settings.plex.hostname, username, password).connect();
	settings.plex.token = plexApi.token as string;
	console.log(`Fetched plex token: ${settings.plex.token}\n`);
};

const promptPlexSections = async () => {
	settings.plex.sectionsToUpdate = (await prompts.plex.sections(settings.plex.sectionsToUpdate.join(", ")));
	settings.plex.sectionsToUpdate.splice(settings.plex.sectionsToUpdate.indexOf(""), 1);
	if (settings.plex.sectionsToUpdate.length === 0) {
		console.log("You didnt specify any plex sections to update! Disabling plex integration...\n");
		settings.plex.enabled = false;
		return false;
	}
};

const firstLaunch = async () => {
	console.log("Welcome to Floatplane Downloader! Thanks for checking it out <3.");
	console.log("According to your settings.json this is your first launch! So lets go through the basic setup...\n");
	console.log("\n== General ==\n");

	settings.videoFolder = await prompts.settings.videoFolder(settings.videoFolder);
	settings.floatplane.videosToSearch = await prompts.floatplane.videosToSearch(settings.floatplane.videosToSearch);
	settings.downloadThreads = await prompts.settings.downloadThreads(settings.downloadThreads);
	settings.floatplane.videoResolution = await prompts.settings.videoResolution(settings.floatplane.videoResolution, defaultResoulutions);
	settings.fileFormatting = await prompts.settings.fileFormatting(settings.fileFormatting, settings._fileFormattingOPTIONS);

	const extras = await prompts.settings.extras(settings.extras);
	for (const extra in settings.extras) settings.extras[extra] = extras.indexOf(extra) > -1?true:false;

	settings.repeat.enabled = await prompts.settings.repeat(settings.repeat.enabled);
	if (settings.repeat.enabled) settings.repeat.interval = await prompts.settings.repeatInterval(settings.repeat.interval);

	console.log("\n== Floatplane ==\n");
	console.log("Next we are going to login to floatplane...");
	await promptFloatplaneLogin();

	// Prompt to find best edge server for downloading
	if (await prompts.findClosestServerNow()) settings.floatplane.edge = findClosestEdge(await fApi.api.edges()).hostname;
	console.log(`Closest edge server found is: "${settings.floatplane.edge}"\n`);

	// Prompt & Set auto finding best edge server
	settings.floatplane.findClosestEdge = await prompts.settings.autoFindClosestServer(settings.floatplane.findClosestEdge);

	console.log("\n== Plex ==\n");
	settings.plex.enabled = await prompts.plex.usePlex(settings.plex.enabled);
	if (settings.plex.enabled) {
		if (await promptPlexSections()) {
			await promptPlexLogin();
			settings.plex.hostname = await prompts.plex.hostname(settings.plex.hostname);
			settings.plex.port = await prompts.plex.port(settings.plex.port);
		}
	}
}

// Async start
;(async () => {
	// Earlybird functions, these are run before script start and not run again if script repeating is enabled.
	if (settings.runQuickstartPrompts) {
		await firstLaunch();
		console.log("\n== All Setup! ==\n");
	}
	settings.runQuickstartPrompts = false;

	// Get Plex details of not saved
	if (settings.plex.enabled) {
		if (settings.plex.sectionsToUpdate.length === 0) {
			console.log("You have plex integration enabled but no sections set for updating!");
			await promptPlexSections();
		}
		if (!settings.plex.hostname) {
			console.log("You have plex integration enabled but have not specified a hostname!");
			settings.plex.hostname = await prompts.plex.hostname(settings.plex.hostname);
		} if (!settings.plex.port) {
			console.log("You have plex integration enabled but have not specified a port!");
			settings.plex.port = await prompts.plex.port(settings.plex.port);
		} if (!settings.plex.token) {
			console.log("You have plex integration enabled but have not specified a token!");
			await promptPlexLogin();
		}
	}

	// Get Floatplane credentials if not saved
	if (cookieJar.toJSON().cookies.length === 0) {
		console.log("No floatplane cookies found! Please re-enter floatplane details...");
		await promptFloatplaneLogin();
	}

	if (settings.repeat.enabled) {
		const interval = settings.repeat.interval.split(":").map(s => parseInt(s));
		console.log(`\u001b[41mRepeating every ${interval[0]}H, ${interval[1]}m, ${interval[2]}s...\u001b[0m`);
		await start(); // Run
		const SECS = interval[2];
		const MINS = 60*interval[1];
		const HRS = 60*60*interval[0];
		let remaining = SECS+MINS+HRS;
		setInterval(async () => {
			if (remaining === -1) return;
			remaining--;
			if (remaining <= 0) {
				console.log("Auto restarting...\n");
				remaining = -1;
				await start();
				remaining = SECS+MINS+HRS;
			} else if (remaining%10 === 0) console.log(`${~~(remaining/60/60%60)}H, ${~~(remaining/60%60)}m, ${nPad(remaining%60)}s until restart...`);
		}, 1000);
	} else await start(); // If settings.repeatScript is -1 then just run once
})().catch(err => {
	console.error("An error occurred!");
	console.error(err);
	process.exit(1);
});