'use strict';

module.exports = function(grunt) {

  grunt.initConfig({
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
        src: ['src/**/*.ts']
      }
    }
  });

  grunt.loadNpmTasks("grunt-ts");
  grunt.loadNpmTasks("grunt-tslint");

  grunt.registerTask("lint", ["tslint:all"]);
  grunt.registerTask("compile", ["ts"]);
  grunt.registerTask("default", ["lint", "compile"]);

};
