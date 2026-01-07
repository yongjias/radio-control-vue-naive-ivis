// webSocket client to get stream data
class WsClient {
    constructor(url, cb, cb_status)  {
        this.socket = new WebSocket(url)

        let client = this
        this.socket.binaryType = "arraybuffer"
        this.socket.onmessage = (event) => {
            //console.log(event)
            cb(event.data)
        }

        this.socket.onopen = function() {
            //console.log('websocket connectted to ' + url)
            client.socket.send('web client connected!')
            if(cb_status) cb_status(true)
        }

        this.socket.onclose = function(event) {
            //console.log(`socket closed, code=${event.code} reason=${event.reason}`);
            client.socket = undefined
            if(cb_status) cb_status(false)
        }

        this.socket.onerror = function(error) {
            //console.log(`[error] ${error}`);
            client.socket = undefined
            if(cb_status) cb_status(false)
        }
    }
}

export { WsClient }
