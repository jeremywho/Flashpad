module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // react-native-worklets/plugin must be listed last
    'react-native-worklets/plugin',
  ],
};
