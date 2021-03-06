import * as Path from 'path';
import * as FS from 'fs';

import * as Archiver from 'archiver';
import { ExpectedError } from 'clime';
import { awaitable, call as acall } from 'villa';

import {
    ArtifactConfiguration,
    ArtifactMetadata,
    ArtifactMetadataItem,
    FileMappingConfiguration,
    PlatformInfo,
    Plugin,
    Project
} from './';

import { FileWalker, Capture } from '../utils/file-walker';
import * as Style from '../utils/style';

export interface FileMapping {
    package: string | undefined;
    baseDir: string | undefined;
    pattern: string;
    path: string;
    platformSet: Set<string> | undefined;
}

export class Artifact {
    private mappings: FileMapping[];

    constructor(
        private config: ArtifactConfiguration,
        private project: Project
    ) {
        if (!config.files) {
            throw new ExpectedError('Missing `files` field in `artifact` configuration');
        }

        this.mappings = config.files.map(config => this.normalizeMapping(config));
    }

    private async walk(mappings: FileMapping[], platform: PlatformInfo, archiver: Archiver.Archiver): Promise<void> {
        let project = this.project;
        let targetDir = this.config.targetDir;

        let data = Object.assign({
            platform: platform.name
        }, platform.variables);

        for (let mapping of mappings) {
            let baseDir = project.renderTemplate(this.resolveBaseDir(mapping, platform.name), data);
            let mappingPattern = project.renderTemplate(mapping.pattern, data);
            let mappingPath = project.renderTemplate(mapping.path, data);

            if (targetDir) {
                mappingPath = Path.join(project.renderTemplate(targetDir), mappingPath);
            }

            let walker = new FileWalker(mappingPattern);

            await walker.walk(baseDir, (path, captures) => {
                let pathInArtifact = Artifact.buildPath(mappingPath, captures);

                path = Path.join(baseDir, path);

                archiver.file(path, {
                    name: pathInArtifact
                });

                console.log(Path.relative(project.dir, path), Style.dim('->'), pathInArtifact);
            });
        }
    }

    private resolveBaseDir(mapping: FileMapping, platform: string): string {
        let baseDir: string | undefined;

        let packageName = mapping.package;
        let project = this.project;

        if (packageName) {
            baseDir =
                project.platformSpecified && project.dependencyDirMap.get(`${packageName}\t${platform}`) ||
                project.dependencyDirMap.get(packageName);

            if (!baseDir) {
                throw new ExpectedError(`Dependency package "${packageName}" not found`);
            }

            if (mapping.baseDir) {
                baseDir = Path.resolve(baseDir, mapping.baseDir);
            }
        } else {
            let dirs = [project.dir];

            let config = this.config;
            if (config.baseDir) {
                dirs.push(config.baseDir);
            }

            if (mapping.baseDir) {
                dirs.push(mapping.baseDir);
            }

            baseDir = Path.resolve(...dirs);
        }

        return baseDir;
    }

    async generate(): Promise<void> {
        let project = this.project;

        let { name, version } = project;

        let artifacts: ArtifactMetadataItem[] = [];

        let metadata: ArtifactMetadata = {
            name,
            version,
            artifacts
        };

        let defaultIdPlugin: Plugin | undefined;

        for (let plugin of project.plugins) {
            if (plugin.processArtifactMetadata) {
                await plugin.processArtifactMetadata(metadata);
            }

            if (plugin.getDefaultArtifactId) {
                defaultIdPlugin = plugin;
            }
        }

        for (let platform of project.platforms) {
            console.log();
            console.log(
                project.platformSpecified ?
                    `Generating artifact of project ${Style.id(name)} ${Style.dim(`(${platform.name})`)}...` :
                    `Generating artifact of project ${Style.id(name)}...`
            );
            console.log();

            let idTemplate = this.config.id || (
                defaultIdPlugin ?
                    await defaultIdPlugin.getDefaultArtifactId!(project.platformSpecified ? platform : undefined) :
                    (project.platformSpecified ? '{name}-{platform}' : '{name}')
            );

            let id = project.renderTemplate(idTemplate, {
                platform: project.platformSpecified ? platform.name : undefined
            });

            let archiver = Archiver.create('zip', {});

            let mappings = this
                .mappings
                .filter(mapping => !mapping.platformSet || mapping.platformSet.has(platform.name));

            await this.walk(mappings, platform, archiver);

            archiver.finalize();

            let path = Path.join(project.distDir, `${id}.zip`);

            let writeStream = FS.createWriteStream(path);

            archiver.pipe(writeStream);

            await awaitable(writeStream, 'close', [archiver]);

            console.log();
            console.log(`Artifact generated at path ${Style.path(path)}.`);

            artifacts.push({
                id,
                platform: project.platformSpecified ? platform.name : undefined,
                path: Path.relative(project.distDir, path)
            });
        }

        let metadataFilePath = Path.join(project.distDir, `${name}.json`);
        let metadataJSON = JSON.stringify(metadata, undefined, 4);

        await acall<void>(FS.writeFile, metadataFilePath, metadataJSON);

        console.log();
        console.log(`Artifact metadata generated at path ${Style.path(metadataFilePath)}.`);
    }

    private normalizeMapping(config: FileMappingConfiguration): FileMapping {
        let packageName: string | undefined;
        let pattern: string;
        let baseDir: string | undefined;
        let path: string;
        let platformSet: Set<string> | undefined;

        if (typeof config === 'string') {
            pattern = Path.normalize(config);
            path = pattern;
        } else {
            packageName = config.package;
            pattern = config.pattern && Path.normalize(config.pattern);
            baseDir = config.baseDir && Path.normalize(config.baseDir);
            path = config.path ? Path.normalize(config.path) : pattern;

            let platforms = config.platforms || (config.platform ? [config.platform] : undefined);

            if (platforms) {
                platformSet = new Set(platforms);
            }
        }

        if (!pattern) {
            throw new ExpectedError(`Property \`pattern\` is required for mapping \`${JSON.stringify(config)}\``);
        }

        if (pattern.endsWith(Path.sep)) {
            throw new ExpectedError('Expecting mapping pattern to match files instead of directories');
        }

        let baseName = Path.basename(pattern);

        if (path.endsWith(Path.sep)) {
            if (baseName === '**' && Path.basename(path) === '**') {
                throw new ExpectedError('Invalid path option');
            }

            path = Path.join(path, baseName);
        }

        return {
            package: packageName,
            pattern,
            baseDir,
            path,
            platformSet
        };
    }

    private static buildPath(pattern: string, captures: Capture[]): string {
        let starCaptures: string[] = [];
        let globStarsCaptures: string[][] = [];

        for (let capture of captures) {
            if (typeof capture === 'string') {
                starCaptures.push(capture);
            } else {
                globStarsCaptures.push(capture);
            }
        }

        let startWithSlash = pattern.startsWith(Path.sep);
        let parts = pattern.split('**');

        if (parts.length > 1) {
            for (let i = parts.length - 1; i > 0 && globStarsCaptures.length; i--) {
                let capture = globStarsCaptures.pop() as string[];

                if (capture.length) {
                    parts.splice(i, 0, Path.join(...capture));
                }
            }
        }

        parts = parts.join('').split('*');

        if (parts.length > 1) {
            for (let i = parts.length - 1; i > 0 && starCaptures.length; i--) {
                parts.splice(i, 0, starCaptures.pop() as string);
            }
        }

        let path = Path.normalize(parts.join(''));

        if (!startWithSlash && path.startsWith(Path.sep)) {
            path = path.substr(1);
        }

        return path;
    }
}
