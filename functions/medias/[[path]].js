import {serveMedia} from '../api/_r2_media.js';
import {silent} from '../api/_r2.js';
export function onRequest(context) {
  try {
    const path=new URL(context.request.url).pathname;
    if(!path.startsWith('/medias/'))return silent(404);
    return serveMedia(context,decodeURIComponent(path.slice('/medias/'.length)));
  } catch { return silent(404); }
}
