import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTablePostscan_Movie_Scan_Context extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'Postscan_Movie_Scan_Context');
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
                `mtype int,` +
                `stage int,` +
                `PRIMARY KEY(folder, filename)` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `folder text,` +
                `filename text,` +
                `mtype int,` +
                `stage int,` +
                `PRIMARY KEY(folder, filename)` +
                `)`;

            aSqlText.push(sqlText);
        }

        return aSqlText;
    }
}



