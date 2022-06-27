import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableMTcache_Video_Scan_Context extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'MTcache_Video_Scan_Context');
        this.appPlatform = appPlatform;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgress') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `folder text,` +
                `filename text,` +
                `mtime real,` +
                `mtype int,` +
                `filterValue int,` +
                `isFiltered boolean,` +
                `PRIMARY KEY(folder, filename)` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `folder text,` +
                `filename text,` +
                `mtime real,` +
                `mtype int,` +
                `filterValue int,` +
                `isFiltered boolean,` +
                `PRIMARY KEY(folder, filename)` +
                `)`;

            aSqlText.push(sqlText);
        }

        return aSqlText;
    }
}


