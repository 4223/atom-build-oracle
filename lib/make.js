'use babel';
'use strict';

import path from 'path';
import fs from 'fs';

export function provideBuilder(){

    return class OracleBuildConfig {

        constructor(cwd){
            this.cwd = cwd;
        }

        getNiceName(){
            return 'Oracle Build Config';
        }

        isEligible(){
            this.oracleBuildConfig = path.join(this.cwd, '.atom-build-oracle.json');

            return fs.existsSync(this.oracleBuildConfig);
        }

        settings(){
            this.settingsFetched = new Date();
            var pkgDir = this.getPackagePath();
            let sqlPath = this.getPackageSetting('sqlPath');
            let bgInterpreter = this.getPackageSetting('backgroundInterpreter');

            //if undefined, set to false
            if (!bgInterpreter){
                bgInterpreter = false;
            }

            //start background SQL interpreter when loading the config
            //this will show if there are any errors at boot up/change of config
            if (bgInterpreter){
                this.backgroundStarter();
            }

            var parsedConfig = this.getFileJson(this.oracleBuildConfig);
            var buildTargets = [];

            for (var i = 0; i < parsedConfig.length; i++){
                let currentTarget = parsedConfig[i];
                let thisConfig = {};
                const execExtension = isWindows() ? '.bat' : '.sh'

                thisConfig.name = 'Oracle Build::' + currentTarget.targetName;
                thisConfig.exec = path.join(pkgDir, 'lib','compileOracle' + execExtension);
                thisConfig.args = [
                    currentTarget.host,
                    currentTarget.port.toString(),
                    currentTarget.sid,
                    currentTarget.user,
                    currentTarget.password,
                    pkgDir,
                    "{FILE_ACTIVE}",
                    sqlPath,
                    bgInterpreter.toString()
                ];
                thisConfig.sh = false;

                buildTargets.push(thisConfig);
            }

            return buildTargets;
        }

        on(evt, evtCallback){
            //As as 25.11.2015, `on` only provides the `refresh` evt
            if (evt !== "refresh"){
                return;
            }

            this.fsWatcher = fs.watch(this.oracleBuildConfig, () => {
                var minTime = 1000;//1 second

                //Make sure a reasonable time has passed before calling the
                //refresh callback again
                if (new Date() - this.settingsFetched > minTime){
                    //calling `refreshTargets` in `atom-build/lib/build.js`
                    evtCallback();
                }
            });

            this.sqlPathObvserver = atom.config.observe('build-oracle.sqlPath', (val) => {
                //first call, assign the current setting value
                if (!(this.sqlPath)){
                    this.sqlPath = val;
                } else {
                    //only if its changed should we `refreshTargets`
                    if (this.sqlPath !== val){
                        this.sqlPath = val;
                        evtCallback();
                    }
                }
            });

            if (!isWindows()){
                this.bgObserver = atom.config.observe('build-oracle.backgroundInterpreter', (val) => {
                    //first call, assign the current setting value
                    if (typeof this.backgroundInterpreter == "undefined"){
                        this.backgroundInterpreter = val;
                    } else {
                        //only if its changed should we `refreshTargets`
                        if (this.backgroundInterpreter !== val){
                            this.backgroundInterpreter = val;
                            evtCallback();
                        }
                    }
                });
            }
        }

        off(){
            //Called before a new refresh, so the existing fileWatch can be switched off
            if (this.fsWatcher){
                this.fsWatcher.close();
                this.fsWatcher = undefined;
            }

            if (this.sqlPathObvserver){
                this.sqlPathObvserver.dispose();
                this.sqlPathObvserver = undefined;
            }

            if (this.bgObserver){
                this.bgObserver.dispose();
                this.bgObserver = undefined;
            }
        }

        //Helper functions
        getPluginName(){
            return 'build-oracle';
        }

        getPackagePath(){
            var pkgManager = atom.packages;

            return pkgManager.resolvePackagePath(this.getPluginName());
        }

        getPackageSetting(propertyName){
            var pluginName = this.getPluginName();
            var settingValue = atom.config.get(`${pluginName}.${propertyName}`);

            return settingValue;
        }

        getFileJson(path){
            delete require.cache[path];

            return require(path);
        }

        backgroundStarter(){
            //constants. Also defined in backgroundRunner.sh
            var INTERPRETER_NOT_FOUND = 1;

            var path = require('path');
            var pkgDir = this.getPackagePath();

            //http://stackoverflow.com/questions/11750041/how-to-create-a-named-pipe-in-node-js
            //UNIX FIFOs. We don't support them and probably never will
            if (this.getPackageSetting("backgroundInterpreter") && !isWindows()){
                var processStarter = require('child_process');
                var exec = path.join(pkgDir, 'lib', 'backgroundRunner.sh');
                var tmpDir = path.join(pkgDir, 'tmp');
                var sqlInterpreter = this.getPackageSetting('sqlPath');
                var execWithArgs = exec + ' ' + pkgDir + ' ' + sqlInterpreter;
                var shellStart = processStarter.exec(execWithArgs);

                shellStart.on('exit', function(exitCode){
                    if (exitCode === INTERPRETER_NOT_FOUND){
                        atom.notifications.addWarning('The specified SQL interpreter "' + sqlInterpreter + '" can not be found on the system.\
                        Please correct this in the settings for `build-oracle` otherwise compilations will not succeed.');
                    }
                });
            }
        }
    }

};

function isWindows(){
    return /^win/.test(process.platform);
}

function config(){

    let buildConfig = {};

    buildConfig.sqlPath = {
        title: 'Path to SQL interpreter',
        type: 'string',
        default: 'sqlplus',
        description: 'Specify the path to SQL*Plus (or SQLcl). If its in your path, the basename is acceptable',
        order: 1
    };

    if (!isWindows()){
        buildConfig.backgroundInterpreter = {
            title: 'Run interpreter in background?',
            type: 'boolean',
            default: false,
            description: 'Should the SQL interpreter run in the background? (Experimental to reduce execution times with Java based SQLcl)',
            order: 2
        };
    }

    return buildConfig;
}

module.exports.config = config();
