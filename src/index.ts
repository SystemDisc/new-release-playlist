import util from 'util';
util.inspect.defaultOptions.depth = null;

import { promises as fs } from 'fs';
import { JSDOM } from 'jsdom';
import axios from 'axios';
import { google } from 'googleapis';

import * as C from './constants';
import { authorize } from './youtube';

const jsdom = new JSDOM();

(async function main() {
  console.log('Starting...');
  const auth = await authorize();

  const yt = google.youtube('v3');

  let processedMovies: Set<string>;
  try {
    processedMovies = new Set((await fs.readFile(C.PROCESSED_MOVIES_FILE)).toString('utf-8').split("\n"));
  } catch (e) {
    if (e instanceof Error && (e as any).code === 'ENOENT') {
      processedMovies = new Set([]);
    } else {
      throw e;
    }
  }

  const { data: { items: playlists } } = await yt.playlists.list({
    auth,
    part: ['id', 'contentDetails', 'snippet'],
    mine: true,
  });
  const playlist = (playlists || []).find(p => p.snippet?.title === 'Blu-ray Trailers');
  if (!playlist) {
    throw new Error('You need a playlist called "Blu-ray Trailers"');
  }

  let { data: { items: playlistItems } } = await yt.playlistItems.list({
    auth,
    part: ['id', 'contentDetails', 'snippet'],
    playlistId: playlist.id!,
  });

  if (!playlistItems) playlistItems = [];

  const { data: startHtml } = await axios.get(C.START_URL);
  const domParser = new jsdom.window.DOMParser();
  const doc = domParser.parseFromString(startHtml, 'text/html');
  const trailerLinks: HTMLAnchorElement[] = Array.from(doc.querySelectorAll('.viewtrailer_link a'));
  for (const trailerLink of trailerLinks) {
    const movieName = (trailerLink.closest('.movie_info')?.querySelector('.index_link a')?.textContent || 'Unknown').trim();
    if (processedMovies.has(movieName)) continue;
    await fs.writeFile(C.PROCESSED_MOVIES_FILE, `${movieName}\n`, { flag: 'a+' });
    console.log(`\n\n\n\n${movieName}`);
    const absUrl = new URL(trailerLink.href, C.START_URL);
    const { data: trailerPageHtml } = await axios.get(absUrl.href);
    const doc = domParser.parseFromString(trailerPageHtml, 'text/html');
    const xpr = doc.evaluate('//h2[contains(., "Trailer")]', doc, null, jsdom.window.XPathResult.ANY_TYPE, null);
    for (let h2: HTMLHeadingElement; h2 = xpr.iterateNext() as HTMLHeadingElement; ) {
      if ((h2.textContent || '').includes('Teaser')) continue;
      console.log(h2.textContent);
      if (h2.nextElementSibling?.classList?.contains?.('video-container')) {
        const videoContainer = h2.nextElementSibling as HTMLDivElement;
        const iframe = videoContainer.firstElementChild as HTMLIFrameElement | null;
        const videoUrl = iframe?.src || '';
        const videoId = videoUrl.split('/').pop();
        if (playlistItems!.some(i => i.contentDetails?.videoId === videoId)) {
          continue;
        }
        if (videoId) {
          console.log(videoId);
          try {
            const { data } = await yt.playlistItems.insert({
              auth,
              part: ['id', 'contentDetails', 'snippet'],
              requestBody: {
                snippet: {
                  playlistId: playlist.id!,
                  resourceId: {
                    videoId,
                    kind: 'youtube#video',
                  },
                },
              },
            });
            // console.log('data', JSON.stringify(data, null, 2));
          } catch (e) {
            console.error(e);
          }
        } else {
          console.log('hmmmm', absUrl);
        }
      } else {
        console.log('hmmmm2', absUrl);
      }
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(-1);
}).then(() => {
  console.log('done');
});
