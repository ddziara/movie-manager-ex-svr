import { DB } from './db-db';
import { DBTable } from './db-table';
import { DBTableMovieGroupTypes } from './db-table-moviegrouptypes';
import { DBTableMovieGroupTypeMovieGroups } from './db-table-moviegrouptypemoviegroups';
import { AppPlatformType } from '../common/types';

export class DBextra extends DB {
    moviegrouptype: DBTable;
    moviegrouptypemoviegroup: DBTable;

    private aTables: DBTable[];

    constructor(appPlatform: AppPlatformType) {
        super("extra");
        this.moviegrouptype = new DBTableMovieGroupTypes(this, appPlatform);
        this.moviegrouptypemoviegroup = new DBTableMovieGroupTypeMovieGroups(this, appPlatform);

        this.aTables = [this.moviegrouptype, this.moviegrouptypemoviegroup];
    }

    getTable(index: number): DBTable | null {
        return (index >= 0 && index < this.aTables.length) ? this.aTables[index] : null;
    }
}
