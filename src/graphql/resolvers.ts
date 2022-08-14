import { IContext } from "../context";
import { IBigInt } from "./bigint";
import {
  buildConnectionResponse,
  decodeCursor,
  IConnectionArgs,
  IConnectionResolver,
  // translateConnectionArgs,
} from "./connection";

export enum Visibility {
  INVISIBLE = 0,
  VISIBLE = 1,
}

export interface IGroupType {
  _id: string;
  name: string;
  description: string;
  movieGroups: IConnectionResolver<Partial<IMovieGroup>>;
}

export interface IMovieGroup {
  _id: string;
  type: number;
  name: string;
  addDate: string;
  mediaDate: string;
  modifyDate: string;
  place: string;
  description: string;
  visible: Visibility;
  custom: string;
  groupType: IGroupType;
  movies: IConnectionResolver<Partial<IPositionedMovie>>;
}

export interface IMovie {
  _id: string;
  mediaFullPath: string;
  title: string;
  description: string;
  genre: string;
  length: IBigInt;
  mediaType: number;
  mediaDuration: bigint;
  mediaSize: bigint;
  mediaRating: number;
  mediaResume: bigint;
  resolutionX: number;
  resolutionY: number;
  aspectRatioX: number;
  aspectRatioY: number;
  thumbnailResolutionX: number;
  thumbnailResolutionY: number;
  playCount: number;
  stereoType: string;
  infoFilePath: string;
  isMovieFolder: boolean;
  visible: Visibility;
  orientation: number;
  onlineInfoVisible: number;
  releaseDate: string;
  addDate: string;
  modifyDate: string;
  playDate: string;
  studio: string;
  protected: boolean;
  movieGroups: IConnectionResolver<Partial<IMovieGroup>>;
}

export interface IPositionedMovie extends IMovie {
  listOrder: number;
}

export interface IIDArgs {
  _id: string;
}

const movie_ex_column_names = [
  "description",
  "genre",
  "length",
  "mediatype",
  "mediaDuration",
  "mediaSize",
  "mediaRating",
  "mediaResume",
  "resolutionX",
  "resolutionY",
  "aspectratioX",
  "aspectRatioY",
  "thumbnailResolutionX",
  "thumbnailResolutionY",
  "playCount",
  "stereoType",
  "infoFilePath",
  "isMovieFolder",
  "visible",
  "orientation",
  "onlineInfoVisible",
  "releaseDate",
  "addDate",
  "modifyDate",
  "playDate",
  "studio",
  "protected",
];

const movie_group_ex_column_names = [
  `type`,
  `name`,
  `addDate`,
  `mediaDate`,
  `modifyDate`,
  `place`,
  `description`,
  `visible`,
  `custom`,
];

const group_type_ex_column_names = [`name`];

interface IArrayParams {
  column_names: string[];
  column_values: unknown[];
}

const _objParams2ArrayParams = (obj: Record<string, unknown>): IArrayParams => {
  const column_names: string[] = [];
  const column_values: unknown[] = [];

  if (obj) {
    for (const prop in obj) {
      const val = obj[prop];

      if (typeof val === "object") {
        const val2 = val as Record<string, unknown>;

        if (val2["bigIntStr"] !== undefined) {
          if (typeof val2["bigIntStr"] === "string") {
            const val3 = BigInt(val2["bigIntStr"]);

            column_names.push(prop);
            column_values.push(val3);
          } else {
            throw new Error("bigIntStr is not a string");
          }
        } else {
          throw new Error("Object instead of a primitive value as a value");
        }
      } else {
        column_names.push(prop);
        column_values.push(val);
      }
    }
  }

  return { column_names, column_values };
};

// name of property is always lower case; value coresponds to field name
const _transform2ValidFields = (
  rows: Record<string, unknown>[],
  trans_data: Record<string, string>
) => {
  if (rows) {
    rows.forEach((row) => {
      for (const row_prop in row) {
        // checj if property exists in "trans_data"
        const fieldName = trans_data[row_prop.toLocaleLowerCase()];

        if (fieldName) {
          // check if names are different
          if (row_prop.localeCompare(fieldName) !== 0) {
            const val = row[row_prop];

            delete row[row_prop]; // delete property
            row[fieldName] = val; // add proerty with "fieldName" and old value
          }
        }
      }
    });
  }
};

const _createTranslateData = (fieldNames: string[]) => {
  const obj: Record<string, string> = {};

  fieldNames.forEach((fieldName) => {
    obj[fieldName.toLocaleLowerCase()] = fieldName;
  });

  return obj;
};

const movies_fields_trans_data = _createTranslateData([
  "_id",
  "mediaFullPath",
  "title",
  "description",
  "genre",
  "length",
  "mediaType",
  "mediaDuration",
  "mediaSize",
  "mediaRating",
  "mediaResume",
  "resolutionX",
  "resolutionY",
  "aspectRatioX",
  "aspectRatioY",
  "thumbnailResolutionX",
  "thumbnailResolutionY",
  "playCount",
  "stereoType",
  "infoFilePath",
  "isMovieFolder",
  "visible",
  "orientation",
  "onlineInfoVisible",
  "releaseDate",
  "addDate",
  "modifyDate",
  "playDate",
  "studio",
  "protected",
  "listOrder",
]);

const groups_fields_trans_data = _createTranslateData([
  `_id`,
  `type`,
  `name`,
  `addDate`,
  `mediaDate`,
  `modifyDate`,
  `place`,
  `description`,
  `visible`,
  `custom`,
]);

const movie_group_types_fields_trans_data = _createTranslateData([
  `_id`,
  `name`,
  `description`,
]);

const getGroupType = async (
  tid: number,
  context: IContext
): Promise<IGroupType | null> => {
  const response =
    await context.dataSources.moviesDataSource.getMovieGroupTypes(
      tid,
      group_type_ex_column_names
    );

  _transform2ValidFields(response.rows, groups_fields_trans_data);

  const rows = response.rows.map((row) => ({
    ...row,
    movieGroups: async function (args: IConnectionArgs, context: IContext) {
      return await getMovieGroupsConnection(
        (this as unknown as IGroupType)._id,
        undefined,
        args,
        context
      );
    },
  }));

  return rows.length === 1 ? (rows[0] as unknown as IGroupType) : null;
};

const getGroupTypesConnection = async (
  { first, after, last, before, offset }: IConnectionArgs,
  context: IContext
): Promise<IConnectionResolver<Partial<IGroupType>>> => {
  const response =
    await context.dataSources.moviesDataSource.getMovieGroupTypes(
      undefined,
      group_type_ex_column_names,
      first,
      after !== undefined ? decodeCursor(after) : undefined,
      last,
      before !== undefined ? decodeCursor(before) : undefined,
      offset
    );

  _transform2ValidFields(response.rows, movie_group_types_fields_trans_data);

  // translate "response.rows" to "edges"
  return buildConnectionResponse(
    response,
    after !== undefined,
    before !== undefined,
    ["_id", "name"],
    () => ({
      movieGroups: async function (args: IConnectionArgs, context: IContext) {
        return await getMovieGroupsConnection(
          (this as unknown as IGroupType)._id,
          undefined,
          args,
          context
        );
      },
    })
  );
};

const getMovieGroupsConnection = async (
  tid: string | undefined,
  mid: string | undefined,
  { first, after, last, before, offset }: IConnectionArgs,
  context: IContext
): Promise<IConnectionResolver<Partial<IMovieGroup>>> => {
  if (mid !== undefined) {
    // note: it utilizes DataSource caching to avoid duplicated requests
    const response =
      await context.dataSources.moviesDataSource.getGroupsOfMovie(
        mid,
        movie_group_ex_column_names,
        first,
        after !== undefined ? decodeCursor(after) : undefined,
        last,
        before !== undefined ? decodeCursor(before) : undefined,
        offset
      );

    _transform2ValidFields(response.rows, groups_fields_trans_data);

    // translate "response.rows" to "edges"
    return buildConnectionResponse(
      response,
      after !== undefined,
      before !== undefined,
      ["_id", "name"],
      () => ({
        movies: async function (args: IConnectionArgs, context: IContext) {
          return await getMoviesConnection<IPositionedMovie>(
            parseInt((this as unknown as IMovieGroup)._id),
            args,
            context
          );
        },
        groupType: async function (args: unknown, context: IContext) {
          const gendid = (this as unknown as IMovieGroup & { gendid: number })
            .gendid;

          if (gendid) {
            return await getGroupType(gendid, context);
          } else {
            return undefined;
          }
        },
      }) // to enforce resolving this field by a type resolver function
    );
  } else {
    // note: it utilizes DataSource caching to avoid duplicated requests
    const response = await context.dataSources.moviesDataSource.getMovieGroups(
      tid ? parseInt(tid) : undefined,
      undefined,
      movie_group_ex_column_names,
      first,
      after !== undefined ? decodeCursor(after) : undefined,
      last,
      before !== undefined ? decodeCursor(before) : undefined,
      offset
    );

    _transform2ValidFields(response.rows, groups_fields_trans_data);

    // translate "response.rows" to "edges"
    return buildConnectionResponse(
      response,
      after !== undefined,
      before !== undefined,
      ["_id", "name"],
      () => ({
        movies: async function (args: IConnectionArgs, context: IContext) {
          return await getMoviesConnection<IPositionedMovie>(
            parseInt((this as unknown as IMovieGroup)._id),
            args,
            context
          );
        },
        groupType: async function (args: unknown, context: IContext) {
          const gendid = (this as unknown as IMovieGroup & { gendid: number })
            .gendid;

          if (gendid) {
            return await getGroupType(gendid, context);
          } else {
            return undefined;
          }
        },
      }) // to enforce resolving this field by a type resolver function
    );
  }
};

const getMoviesConnection = async <T>(
  gid: number | undefined,
  { first, after, last, before, offset }: IConnectionArgs,
  context: IContext
): Promise<IConnectionResolver<Partial<T>>> => {
  const response = await context.dataSources.moviesDataSource.getMovies(
    gid,
    undefined,
    movie_ex_column_names,
    first,
    after !== undefined ? decodeCursor(after) : undefined,
    last,
    before !== undefined ? decodeCursor(before) : undefined,
    offset
  );

  _transform2ValidFields(response.rows, movies_fields_trans_data);

  // translate "response.rows" to "edges"
  return buildConnectionResponse(
    response,
    after !== undefined,
    before !== undefined,
    gid ? ["listOrder"] : ["_id", "title"],
    () => ({
      movieGroups: async function (args: IConnectionArgs, context: IContext) {
        return await getMovieGroupsConnection(
          undefined,
          (this as unknown as IMovie)._id,
          args,
          context
        );
      },
    }) // to enforce resolving this field by a type resolver function
  );
};

export const resolvers = {
  Visibility: {
    INVISIBLE: Visibility.INVISIBLE,
    VISIBLE: Visibility.VISIBLE,
  },

  BigInt: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bigIntStr: (parent: unknown, args: unknown, context: IContext) => {
      const val = parent as bigint;
      return val.toString();
    },
  },

  Query: {
    movies: async (parent: unknown, args: IConnectionArgs, context: IContext) => {
      return await getMoviesConnection<IMovie>(undefined, args, context)
    },
    movie: async (parent: unknown, { _id }: IIDArgs, context: IContext) => {
      const response = await context.dataSources.moviesDataSource.getMovies(
        undefined,
        _id,
        movie_ex_column_names
      );

      _transform2ValidFields(response.rows, movies_fields_trans_data);

      const rows = response.rows.map((row) => ({
        ...row,
        movieGroups: async function (args: IConnectionArgs, context: IContext) {
          return await getMovieGroupsConnection(
            undefined,
            (this as unknown as IMovie)._id,
            args,
            context
          );
        },
      }));

      return rows.length === 1 ? rows[0] : null;
    },
    movieGroups: async (
      parent: unknown,
      args: IConnectionArgs,
      context: IContext
    ) => await getMovieGroupsConnection(undefined, undefined, args, context),
    movieGroup: async (
      parent: unknown,
      { _id }: IIDArgs,
      context: IContext
    ) => {
      const response =
        await context.dataSources.moviesDataSource.getMovieGroups(
          undefined,
          parseInt(_id),
          movie_group_ex_column_names
        );

      _transform2ValidFields(response.rows, groups_fields_trans_data);

      const rows = response.rows.map((row) => ({
        ...row,
        movies: async function (args: IConnectionArgs, context: IContext) {
          return await getMoviesConnection<IPositionedMovie>(
            parseInt((this as unknown as IMovieGroup)._id),
            args,
            context
          );
        },
        groupType: async function (args: unknown, context: IContext) {
          const gendid = (this as unknown as IMovieGroup & { gendid: number })
            .gendid;

          if (gendid) {
            return await getGroupType(gendid, context);
          } else {
            return undefined;
          }
        },
      }));

      return rows.length === 1 ? rows[0] : null;
    },
    groupTypes: async (
      parent: unknown,
      args: IConnectionArgs,
      context: IContext
    ) => getGroupTypesConnection(args, context),
    groupType: async (parent: unknown, { _id }: IIDArgs, context: IContext) => {
      return await getGroupType(parseInt(_id), context);
    },
  },

  Mutation: {
    // movies
    addMovie: async (
      parent: unknown,
      {
        mediaFullPath,
        gid,
        listOrder,
        movieInfo,
      }: {
        mediaFullPath: string;
        gid: string;
        listOrder: number;
        movieInfo: Record<string, unknown>;
      },
      context: IContext
    ): Promise<string> => {
      const { column_names, column_values } = _objParams2ArrayParams(movieInfo);
      column_names.unshift("mediaFullPath");
      column_values.unshift(mediaFullPath);

      return await context.dataSources.moviesDataSource.addMovie(
        gid !== undefined ? parseInt(gid) : undefined,
        listOrder,
        column_names,
        column_values
      );
    },
    updateMovie: async (
      parent: unknown,
      { _id, movieInfo }: { _id: string; movieInfo: Record<string, unknown> },
      context: IContext
    ): Promise<boolean> => {
      const { column_names, column_values } = _objParams2ArrayParams(movieInfo);

      try {
        await context.dataSources.moviesDataSource.updateMovie(
          _id,
          column_names,
          column_values
        );

        return true;
      } catch (e) {
        return false;
      }
    },
    deleteMovie: async (
      parent: unknown,
      { _id }: { _id: string },
      context: IContext
    ): Promise<boolean> => {
      try {
        await context.dataSources.moviesDataSource.deleteMovie(_id);
        return true;
      } catch (e) {
        return false;
      }
    },
    // moviegroup
    addMovieGroup: async (
      parent: unknown,
      {
        tid,
        movieGroupInfo,
      }: { tid: string; movieGroupInfo: Record<string, unknown> },
      context: IContext
    ): Promise<number> => {
      const { column_names, column_values } =
        _objParams2ArrayParams(movieGroupInfo);

      return await context.dataSources.moviesDataSource.addMovieGroup(
        tid ? parseInt(tid) : undefined,
        undefined,
        column_names,
        column_values
      );
    },
    updateMovieGroup: async (
      parent: unknown,
      {
        _id,
        movieGroupInfo,
      }: { _id: string; movieGroupInfo: Record<string, unknown> },
      context: IContext
    ): Promise<boolean> => {
      const { column_names, column_values } =
        _objParams2ArrayParams(movieGroupInfo);

      try {
        await context.dataSources.moviesDataSource.updateMovieGroup(
          parseInt(_id),
          column_names,
          column_values
        );

        return true;
      } catch (e) {
        return false;
      }
    },
    deleteMovieGroup: async (
      parent: unknown,
      { _id }: IIDArgs,
      context: IContext
    ): Promise<boolean> => {
      try {
        await context.dataSources.moviesDataSource.deleteMovieGroup(parseInt(_id));

        return true;
      } catch (e) {
        return false;
      }
    },
    // group types
    addGroupType: async (
      parent: unknown,
      { groupTypeInfo }: { groupTypeInfo: Record<string, unknown> },
      context: IContext
    ): Promise<number> => {
      const { column_names, column_values } =
        _objParams2ArrayParams(groupTypeInfo);

      return await context.dataSources.moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
    },
    updateGroupType: async (
      parent: unknown,
      {
        _id,
        groupTypeInfo,
      }: { _id: string; groupTypeInfo: Record<string, unknown> },
      context: IContext
    ): Promise<boolean> => {
      const { column_names, column_values } =
        _objParams2ArrayParams(groupTypeInfo);

      try {
        await context.dataSources.moviesDataSource.updateMovieGroupType(
          parseInt(_id),
          column_names,
          column_values
        );

        return true;
      } catch (e) {
        return false;
      }
    },
    deleteGroupType: async (
      parent: unknown,
      { _id }: IIDArgs,
      context: IContext
    ): Promise<boolean> => {
      try {
        await context.dataSources.moviesDataSource.deleteMovieGroupType(parseInt(_id));

        return true;
      } catch (e) {
        return false;
      }
    },
    // movie groups & movies
    associateMovieAndMovieGroup: async (
      parent: unknown,
      {
        _mid,
        _gid,
        listOrder,
      }: { _mid: string; _gid: string; listOrder: number },
      context: IContext
    ) => {
      try {
        await context.dataSources.moviesDataSource.markMovieGroupMember(
          _mid,
          parseInt(_gid),
          listOrder
        );
        return true;
      } catch (e) {
        return false;
      }
    },
    unassociateMovieAndMovieGroup: async (
      parent: unknown,
      { _mid, _gid }: { _mid: string; _gid: string },
      context: IContext
    ) => {
      try {
        await context.dataSources.moviesDataSource.unmarkMovieGroupMember(
          parseInt(_gid),
          _mid
        );
        return true;
      } catch (e) {
        return false;
      }
    },
    // group types & movie groups
    moveMovieGroup2Type: async (
      parent: unknown,
      { _gid, _tid }: { _gid: string; _tid: string },
      context: IContext
    ) => {
      try {
        await context.dataSources.moviesDataSource.moveMovieGroup2AnotherType(
          parseInt(_gid),
          parseInt(_tid)
        );
        return true;
      } catch (e) {
        return false;
      }
    },
    removeMovieGroupFromType: async (
      parent: unknown,
      { _gid }: { _gid: string },
      context: IContext
    ) => {
      try {
        await context.dataSources.moviesDataSource.moveMovieGroup2NoType(
          0,
          parseInt(_gid)
        );
        return true;
      } catch (e) {
        return false;
      }
    },
  },
};
