import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableFaceInfo extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'FaceInfo');
        this.appPlatform = appPlatform;
    }

    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgres') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `faceID SERIAL PRIMARY KEY,` +
                `mediaID INTEGER,` +
                `groupID INTEGER` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `faceID INTEGER PRIMARY KEY,` +
                `mediaID INTEGER,` +
                `groupID INTEGER` +
                `)`;

            aSqlText.push(sqlText);
        }

        if ((this.appPlatform === 'postgres') || (this.appPlatform === 'cyberlink')) {
            const indexName = 'FACEINFO_FACEID_GROUPID_MEDIAID_INDEX';
            const sqlIndexText = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName) : indexName} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (groupID, mediaID)`;

            aSqlText.push(sqlIndexText);
        }

        return aSqlText;
    }
}

