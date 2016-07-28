import {
    Command,
    ExpectedError,
    Options,
    command,
    option,
    params,
    Printable
} from 'clime';

import {
    ProjectConfiguration,
    Project,
    File
} from '../core';

import cli from '../cli';

export class DistributeOptions extends Options {
    @option({
        description: 'Specify a configuration file.',
        flag: 'c',
        placeholder: 'filename',
        default: 'dist.config.js'
    })
    config: File;
}

@command({
    description: 'Distribute a project.'
})
export default class extends Command {
    async execute(
        @params({
            type: String,
            description: 'Names of projects to distribute.'
        })
        names: string[],

        options: DistributeOptions
    ) {
        let configFile = options.config;

        await configFile.assert();

        let configs = configFile.require<ProjectConfiguration | ProjectConfiguration[]>();

        if (!Array.isArray(configs)) {
            configs = [configs];
        }

        let projectConfigMap = new Map<string, ProjectConfiguration>();

        for (let config of configs) {
            let name = config.name;

            if (!name) {
                throw new ExpectedError('Project name is required');
            }

            if (projectConfigMap.has(name)) {
                throw new ExpectedError(`Duplicated project name "${name}"`);
            }

            projectConfigMap.set(name, config);
        }

        if (names.length) {
            configs = names.map(name => {
                let config = projectConfigMap.get(name);

                if (config) {
                    return config;
                } else {
                    throw new ExpectedError(`Project "${name}" does not exist`);
                }
            });
        }

        let projects: Project[] = [];

        for (let config of configs) {
            let project = new Project(config);

            await project.load();

            projects.push(project);
        }

        for (let project of projects) {
            await project.clean();
        }

        for (let project of projects) {
            await project.distribute();
        }
    }
}
