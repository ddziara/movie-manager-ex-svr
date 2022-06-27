import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableCreationInfo extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'CreationInfo');
        this.appPlatform = appPlatform;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getSQLCreateText(useSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = []

        if (this.appPlatform === 'postgress') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id SERIAL PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `creationName TEXT NOT NULL,` +
                `projectPath TEXT NOT NULL,` +
                `thumbCount INTEGER NOT NULL,` +
                `description TEXT DEFAULT '',` +
                `modifyDate TIMESTAMP NOT NULL` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id INTEGER PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `creationName TEXT NOT NULL,` +
                `projectPath TEXT NOT NULL,` +
                `thumbCount INTEGER NOT NULL,` +
                `description TEXT DEFAULT '',` +
                `modifyDate TIMESTAMP NOT NULL` +
                `)`;

            aSqlText.push(sqlText);
        }

        return aSqlText;
    }
}

