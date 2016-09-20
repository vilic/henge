import * as FS from 'fs';
import * as PathModule from 'path';

import {
    Context,
    ExpectedError,
    StringCastable
} from 'clime';

import { call as acall } from 'villa';

export class File {
    readonly baseName: string;
    readonly fullName: string;

    private constructor(
        public readonly source: string,
        public readonly cwd: string
    ) {
        this.baseName = PathModule.basename(source);
        this.fullName = PathModule.resolve(cwd, source);
    }

    require<T>(): T {
        try {
            return require(this.fullName);
        } catch (error) {
            throw new ExpectedError(`Error parsing requiring file "${this.source}"`);
        }
    }

    async assert(exists = true): Promise<void> {
        let stats: FS.Stats | undefined;

        try {
            stats = await acall<FS.Stats>(FS.stat, this.fullName);
        } catch (error) { }

        if (exists) {
            if (!stats) {
                throw new ExpectedError(`File "${this.source}" does not exist`);
            }

            if (!stats.isFile()) {
                throw new ExpectedError(`Path "${this.source}" is expected to be a file`);
            }
        } else if (stats) {
            throw new ExpectedError(`Path "${this.source}" already exists`);
        }
    }

    static cast(name: string, context: Context): File {
        return new this(name, context.cwd);
    }
}

export class CommaSeperatedStrings extends Array<string> {
    static cast(line: string): CommaSeperatedStrings {
        let values = line
            .split(',')
            .map(str => str.trim())
            .filter(str => !!str);

        return new this(...values);
    }
}
