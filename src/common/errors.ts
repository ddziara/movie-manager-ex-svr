interface ICustomError extends Error {
    __proto__: object;              
}

const setupCustomError = <T extends ErrorConstructor>(ceThis: ICustomError, name: string, constr: T, actualProto: object): void => {
    ceThis.name = name;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
        Error.captureStackTrace(ceThis, constr);
    }

    // restore prototype chain   
    if (Object.setPrototypeOf) {
        Object.setPrototypeOf(ceThis, actualProto);
    }
    else {
        ceThis.__proto__ = actualProto;
    }
}

export class MissingGroupTypeError extends Error {
    __proto__!: object;              // ! (non-null assertion) is used to avoid TypeScript 'property uninitialized' error

    constructor(message?: string) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(message);

        // Note:
        //   Passing "MissingGroupTypeError" causes problem probably because ErrorConstructor signature is as follows:
        //   interface ErrorConstructor {
        //      new(messsage? string): Error            
        //      (messsage? string): Error
        //   }
        //
        //   It means that it is possible to call it without "new" operator
        setupCustomError(this, "MissingGroupTypeError", MissingGroupTypeError as unknown as ErrorConstructor, new.target.prototype);
    }
}

export class MissingGroupError extends Error {
    __proto__!: object;              // ! (non-null assertion) is used to avoid TypeScript 'property uninitialized' error

    constructor(message?: string) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(message);
        setupCustomError(this, "MissingGroupError", MissingGroupError as unknown as ErrorConstructor, new.target.prototype);
    }
}

export class MissingMovieError extends Error {
    __proto__!: object;              // ! (non-null assertion) is used to avoid TypeScript 'property uninitialized' error

    constructor(message?: string) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(message);
        setupCustomError(this, "MissingMovieError", MissingMovieError as unknown as ErrorConstructor, new.target.prototype);
    }
}

export class CannotDeleteUsedTypeError extends Error {
    __proto__!: object;              // ! (non-null assertion) is used to avoid TypeScript 'property uninitialized' error

    constructor(message?: string) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(message);
        setupCustomError(this, "CannotDeleteUsedTypeError", CannotDeleteUsedTypeError as unknown as ErrorConstructor, new.target.prototype);
    }
}

export class MissingLastIdError extends Error {
    __proto__!: object;              // ! (non-null assertion) is used to avoid TypeScript 'property uninitialized' error

    constructor(message?: string) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(message);
        setupCustomError(this, "MissingLastIdError", MissingLastIdError as unknown as ErrorConstructor, new.target.prototype);
    }
}


