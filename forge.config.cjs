module.exports = {
  packagerConfig: {
    name: 'Mindtraveller',
    executableName: 'Mindtraveller',
    asar: true
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
