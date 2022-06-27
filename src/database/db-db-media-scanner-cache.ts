import { DB } from './db-db';
import { DBTable } from './db-table';
import { DBTableMTcache_Movie_Scan_Context } from './db-table-mtcache-movie-scan-context';
import { DBTableMTcache_Music_Scan_Context } from './db-table-mtcache-music-scan-context';
import { DBTableMTcache_Photo_Scan_Context } from './db-table-mtcache-photo-scan-context';
import { DBTableMTcache_Video_Scan_Context } from './db-table-mtcache-video-scan-context';
import { DBTablePostscan_Movie_Scan_Context } from './db-table-postscan-movie-scan-context';
import { DBTablePostscan_Music_Scan_Context } from './db-table-postscan-music-scan-context';
import { DBTablePostscan_Photo_Scan_Context } from './db-table-postscan-photo-scan-context';
import { DBTablePostscan_Video_Scan_Context } from './db-table-postscan-video-scan-context';
import { AppPlatformType } from '../common/types';

export class DBmedia_scanner_cache extends DB {
    mtcache_movie_scan_context: DBTable;
    mtcache_music_scan_context: DBTable;
    mtcache_photo_scan_context: DBTable;
    mtcache_video_scan_context: DBTable;
    postscan_movie_scan_context: DBTable;
    postscan_music_scan_context: DBTable;
    postscan_photo_scan_context: DBTable;
    postscan_video_scan_context: DBTable;

    private aTables: DBTable[];

    constructor(appPlatform: AppPlatformType) {
        super("mediaScannerCache");
        this.mtcache_movie_scan_context = new DBTableMTcache_Movie_Scan_Context(this, appPlatform);
        this.mtcache_music_scan_context = new DBTableMTcache_Music_Scan_Context(this, appPlatform);
        this.mtcache_photo_scan_context = new DBTableMTcache_Photo_Scan_Context(this, appPlatform);
        this.mtcache_video_scan_context = new DBTableMTcache_Video_Scan_Context(this, appPlatform);
        this.postscan_movie_scan_context = new DBTablePostscan_Movie_Scan_Context(this, appPlatform);
        this.postscan_music_scan_context = new DBTablePostscan_Music_Scan_Context(this, appPlatform);
        this.postscan_photo_scan_context = new DBTablePostscan_Photo_Scan_Context(this, appPlatform);
        this.postscan_video_scan_context = new DBTablePostscan_Video_Scan_Context(this, appPlatform);

        this.aTables = [this.mtcache_movie_scan_context, this.mtcache_music_scan_context, this.mtcache_photo_scan_context, this.mtcache_video_scan_context, 
            this.postscan_movie_scan_context, this.postscan_music_scan_context, this.postscan_photo_scan_context, this.postscan_video_scan_context];
    }

    getTable(index: number): DBTable | null {
        return (index >= 0 && index < this.aTables.length) ? this.aTables[index] : null;
    }
}


