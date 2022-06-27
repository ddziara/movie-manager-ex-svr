import { DB } from './db-db';
import { DBTable } from './db-table';
import { DBTableCreationInfo } from './db-table-creationinfo';
import { DBTableFaceInfo } from './db-table-faceinfo';
import { DBTableGroupOrderInfo } from './db-table-grouporderinfo';
import { DBTableMediaInfo } from './db-table-mediainfo';
import { DBTableGroupInfo } from './db-table-groupinfo';
import { DBTableOrderInfo } from './db-table-orderinfo';
import { DBTablePersonInfo } from './db-table-personinfo';
import { AppPlatformType } from '../common/types';

export class DBcldb extends DB {
    creation_info: DBTable;
    face_info: DBTable;
    group_info: DBTable;
    group_order_info: DBTable;
    media_info: DBTable;
    order_info: DBTable;
    person_info: DBTable;

    private aTables: DBTable[];

    constructor(appPlatform: AppPlatformType) {
        super("CLDB");
        this.creation_info = new DBTableCreationInfo(this, appPlatform);
        this.face_info = new DBTableFaceInfo(this, appPlatform);
        this.group_info = new DBTableGroupInfo(this, appPlatform);
        this.group_order_info = new DBTableGroupOrderInfo(this, appPlatform);
        this.media_info = new DBTableMediaInfo(this, appPlatform);
        this.order_info = new DBTableOrderInfo(this, appPlatform);
        this.person_info = new DBTablePersonInfo(this, appPlatform);

        this.aTables = [this.creation_info, this.face_info, this.group_order_info, this.media_info, this.order_info, this.person_info];
    }

    getTable(index: number): DBTable | null {
        return (index >= 0 && index < this.aTables.length) ? this.aTables[index] : null;
    }
}
