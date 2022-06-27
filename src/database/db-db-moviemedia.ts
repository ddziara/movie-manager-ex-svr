import { DB } from './db-db';
import { DBTable } from './db-table';
import { DBTableMediaInfo2 } from './db-table-mediainfo2';
import { AppPlatformType } from '../common/types';

export class DBmoviemedia extends DB {
    media_info: DBTable;

    private aTables: DBTable[];

    constructor(appPlatform: AppPlatformType) {
        super("moviemedia");
        this.media_info = new DBTableMediaInfo2(this, appPlatform);

        this.aTables = [this.media_info];
    }

    getTable(index: number): DBTable | null {
        return (index >= 0 && index < this.aTables.length) ? this.aTables[index] : null;
    }
}

