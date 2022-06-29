import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTablePersonInfo extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'PersonInfo');
        this.appPlatform = appPlatform;
    }

    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgres') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `groupID SERIAL PRIMARY KEY,` +
                `personID INTEGER,` +
                `displayFaceID INTEGER,` +
                `birthday DATE` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `groupID INTEGER PRIMARY KEY,` +
                `personID INTEGER,` +
                `displayFaceID INTEGER,` +
                `birthday DATE` +
                `)`;

            aSqlText.push(sqlText);
        }

        if ((this.appPlatform === 'postgres') || (this.appPlatform === 'cyberlink')) {
            const indexName = 'PERSONINFO_GROUPID_PERSONID_INDEX';
            const sqlIndexText = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName) : indexName} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (groupID, personID)`;

            aSqlText.push(sqlIndexText);
        }

        return aSqlText;
    }
}

