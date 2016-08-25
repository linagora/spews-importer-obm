'use strict';

module.exports = function(grunt) {

  grunt.initConfig({
    mochacli: {
      options: {
        require: ['chai'],
        reporter: 'spec',
        compilers: ['ts:ts-node/register']
      },
      all: ['./tests/**/*.spec.ts']
    },
    ts: {
      default : {
        tsconfig: true
      }
    },
    tslint: {
      options: {
        configuration: "tslint.json"
      },
      all: {
        src: [
          'src/**/*.ts',
          'tests/**/*.ts'
        ]
      }
    }
  });

  grunt.loadNpmTasks('grunt-mocha-cli');
  grunt.loadNpmTasks("grunt-ts");
  grunt.loadNpmTasks("grunt-tslint");

  grunt.registerTask("lint", ["tslint:all"]);
  grunt.registerTask("compile", ["ts"]);
  grunt.registerTask("test", ["mochacli"]);
  grunt.registerTask("default", ["lint", "test", "compile"]);

};
