import { DB } from './db-db';
import { DBTable } from './db-table';
import { DBTablePlayItemInfo } from './db-table-playiteminfo';
import { DBTablePlayListInfo } from './db-table-playlistinfo';
import { AppPlatformType } from '../common/types';

export class DBplaylist extends DB {
    playiteminfo: DBTable;
    playlistinfo: DBTable;

    private aTables: DBTable[];

    constructor(appPlatform: AppPlatformType) {
        super("Playlist");
        this.playiteminfo = new DBTablePlayItemInfo(this, appPlatform);
        this.playlistinfo = new DBTablePlayListInfo(this, appPlatform);

        this.aTables = [this.playiteminfo, this.playlistinfo];
    }

    getTable(index: number): DBTable | null {
        return (index >= 0 && index < this.aTables.length) ? this.aTables[index] : null;
    }
}
