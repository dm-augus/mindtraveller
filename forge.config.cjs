module.exports = {
  packagerConfig: {
    name: 'Mindtraveller',
    executableName: 'Mindtraveller',
    asar: true,
    ignore: (filePath) => filePath !== '' && !/^\/(dist|node_modules)(\/|$)/.test(filePath)
      && filePath !== '/package.json'
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Mindtraveller'
      }
    }
  ]
};
