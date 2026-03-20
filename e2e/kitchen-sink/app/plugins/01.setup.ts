// Plugin 01: provides a greeting string via app.provide()
export default {
  name: 'ks-setup',
  setup(app: any) {
    app.provide('ks-greeting', 'Hello from ks-setup plugin!')
  },
}
