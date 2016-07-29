export interface PackageData {
    name: string;
    version: string;
}

export interface PlatformSpecifier {
    multiplatform?: boolean;
    platform?: string;
    platforms?: string[];
}

export interface TaskDescriptor {
    name: string;
    args?: string[];
}

export interface CommandDescriptor {
    name: string;
    args?: string[];
}

export type TaskConfiguration = string | TaskDescriptor;
export type CommandConfiguration = string | CommandDescriptor;

export interface ProcedureConfiguration {
    description?: string;
    task?: TaskConfiguration;
    command?: CommandConfiguration;
    multiplatform?: boolean;
    platform?: string;
    platforms?: string[];
}

export interface FileMappingDescriptor {
    pattern: string;
    baseDir?: string;
    package?: string;
    path?: string;
    platform?: string;
    platforms?: string[];
}

export type FileMappingConfiguration = string | FileMappingDescriptor;

export interface ArtifactMetadataItem {
    id: string;
    platform?: string;
    path: string;
}

export interface ArtifactMetadata {
    name: string;
    version: string;
    artifacts: ArtifactMetadataItem[];
    [key: string]: any;
}

export interface ArtifactConfiguration {
    id?: string;
    root?: string;
    files: FileMappingConfiguration[];
}

export interface ProjectConfiguration {
    name?: string;
    version?: string;
    distDir?: string;
    dependencyDir?: string;
    plugins?: string[];
    platform?: PlatformConfiguration;
    platforms?: PlatformConfiguration[];
    dependencies?: DependencyConfiguration[];
    procedures?: ProcedureConfiguration[];
    artifact: ArtifactConfiguration;
}

export interface PlatformInfo {
    name: string;
    env?: Dictionary<string>;
    data?: Dictionary<any>;
}

export type PlatformConfiguration = string | PlatformInfo;

export interface DependencyConfiguration extends PlatformSpecifier {
    name: string;
}

export namespace Configuration {
    export interface MatchedPlatformsResult {
        platforms: PlatformInfo[];
        specified: boolean;
    }

    export function getMatchedPlatforms(specifier: PlatformSpecifier, platforms: PlatformInfo[]): MatchedPlatformsResult {
        let platformNames = specifier.platforms ?
            specifier.platforms :
            specifier.platform && [specifier.platform];

        let specified: boolean;

        if (platformNames) {
            let platformNameSet = new Set(platformNames);
            platforms = platforms.filter(platform => platformNameSet.has(platform.name));
            specified = true;
        } else if (specifier.multiplatform) {
            platforms = platforms.concat();
            specified = true;
        } else {
            platforms = [
                {
                    name: process.platform
                }
            ];
            specified = false;
        }

        return {
            platforms,
            specified
        };
    }
}
