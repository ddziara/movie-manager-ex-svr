import DataLoader from "dataloader";
import {
  DBDataMovieManager,
  IGetRowsFunReturn,
  RowObject,
} from "../database/db-data-moviemanager";

interface IFunParams {
  ex_column_names?: string[] | undefined;
}

export interface ILoadParam<K> {
  key: K;
  params?: IFunParams;
}

export interface IMoviesDBLoaders {
  moviesInGroup: DataLoader<ILoadParam<number>, IGetRowsFunReturn, number>;
  groupsOfMovie: DataLoader<ILoadParam<string>, IGetRowsFunReturn, string>;
  typeOfGroup: DataLoader<ILoadParam<number>, IGetRowsFunReturn, number>;
  groupsInType: DataLoader<ILoadParam<number>, IGetRowsFunReturn, number>;
}

const _extractIdsParams = <K>(
  ids: ILoadParam<K>[]
): { ids2: K[]; params: IFunParams } => {
  if (ids.length === 0) {
    return {
      ids2: [],
      params: {},
    };
  } else {
    return {
      ids2: ids.map((item) => item.key),
      params: { ...ids[0].params },
    };
  }
};

const _splitResult = <K>(
  idName: string,
  ids: ILoadParam<K>[],
  result: IGetRowsFunReturn,
  transIdVal?: ((val: ILoadParam<K>) => ILoadParam<K | null>) | undefined
): IGetRowsFunReturn[] => {
  const arrResult: IGetRowsFunReturn[] = [];

  // find actual property name
  if (result.rows.length > 0) {
    const idNameUpper = idName.toLocaleUpperCase();

    for (const prop in result.rows[0]) {
      if (idNameUpper === prop.toLocaleUpperCase()) {
        idName = prop;
        break;
      }
    }
  }

  ids.forEach(function (this: IGetRowsFunReturn[], id: ILoadParam<K>) {
    const res: IGetRowsFunReturn = {
      id_col_names: [...result.id_col_names],
      foreign_id_name: result.foreign_id_name,
      rows: [],
      total_rows_count: BigInt(0),
      rows_count: BigInt(0),
      reversedOrder: result.reversedOrder,
      offset: result.offset,
    };

    if (result.rows.length > 0) {
      res.rows = result.rows.filter(function (
        this: ILoadParam<K>,
        val: RowObject
      ) {
        return val[idName] === this.key;
      },
      transIdVal ? transIdVal(id)  : id);

      // Note: this is incorrect in fact
      res.total_rows_count = BigInt(res.rows.length);

      res.rows.forEach(function (this: number, row: RowObject) {
        row.total_count = this;
      }, res.total_rows_count);
    }

    (this as unknown as IGetRowsFunReturn[]).push(res);
  }, arrResult);

  return arrResult;
};

const _genMoviesInGroup = async (
  dbDataMovieManager: DBDataMovieManager,
  ids: ILoadParam<number>[]
): Promise<IGetRowsFunReturn[]> => {
  const { ids2, params } = _extractIdsParams(ids);
  const result = await dbDataMovieManager.getMovies(
    ids2,
    undefined,
    params.ex_column_names
  );
  return _splitResult("playlistID", ids, result);
};

const _genGroupsOfMovie = async (
  dbDataMovieManager: DBDataMovieManager,
  ids: ILoadParam<string>[]
): Promise<IGetRowsFunReturn[]> => {
  const { ids2, params } = _extractIdsParams(ids);
  const result = await dbDataMovieManager.getGroupsOfMovie(
    ids2,
    params.ex_column_names
  );
  return _splitResult("mid", ids, result);
};

const _genTypeOfGroup = async (
  dbDataMovieManager: DBDataMovieManager,
  ids: ILoadParam<number>[]
): Promise<IGetRowsFunReturn[]> => {
  const { ids2, params } = _extractIdsParams(ids);
  const result = await dbDataMovieManager.getMovieGroupTypes(
    ids2,
    params.ex_column_names
  );
  return _splitResult("_id", ids, result);
};

const _genGroupsInType = async (
  dbDataMovieManager: DBDataMovieManager,
  ids: ILoadParam<number>[]
): Promise<IGetRowsFunReturn[]> => {
  const { ids2, params } = _extractIdsParams(ids);
  const result = await dbDataMovieManager.getMovieGroups(
    ids2,
    undefined,
    params.ex_column_names
  );
  return _splitResult("gendid", ids, result, (val: ILoadParam<number>) => val.key === 0 ? { ...val, key: null } : val);
};

const _key2CacheKey = <K>(key: ILoadParam<K>): K => {
  return key.key;
};

export const createMoviesDBLoaders = (
  dbDataMovieManager: DBDataMovieManager
): IMoviesDBLoaders => {
  return {
    moviesInGroup: new DataLoader(
      async (
        ids: readonly ILoadParam<number>[]
      ): Promise<IGetRowsFunReturn[]> =>
        _genMoviesInGroup(dbDataMovieManager, ids as ILoadParam<number>[]),
      {
        cacheKeyFn: _key2CacheKey,
      }
    ),
    groupsOfMovie: new DataLoader(
      async (
        ids: readonly ILoadParam<string>[]
      ): Promise<IGetRowsFunReturn[]> =>
        _genGroupsOfMovie(dbDataMovieManager, ids as ILoadParam<string>[]),
      {
        cacheKeyFn: _key2CacheKey,
      }
    ),
    typeOfGroup: new DataLoader(
      async (
        ids: readonly ILoadParam<number>[]
      ): Promise<IGetRowsFunReturn[]> =>
        _genTypeOfGroup(dbDataMovieManager, ids as ILoadParam<number>[]),
      {
        cacheKeyFn: _key2CacheKey,
      }
    ),
    groupsInType: new DataLoader(
      async (
        ids: readonly ILoadParam<number>[]
      ): Promise<IGetRowsFunReturn[]> =>
        _genGroupsInType(dbDataMovieManager, ids as ILoadParam<number>[]),
      {
        cacheKeyFn: _key2CacheKey,
      }
    ),
  };
};
