const tcpProxy = require('node-tcp-proxy');
const argparse = require('argparse');
const logger = require('simple-node-logger').createSimpleLogger();

const OnvifServer = require('./src/onvif-server');
const { readAndCheckConfig } = require('./src/config-tools');

const parser = new argparse.ArgumentParser({
    description: 'Virtual RTSP to ONVIF proxy'
});

parser.add_argument('config', { help: 'config filename to use', nargs: '?' });

let args = parser.parse_args();

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    // Opcional: Reiniciar el proceso o realizar limpieza
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Opcional: Reiniciar el proceso o realizar limpieza
});

if (args) {
    try { // Añadido bloque try
        if (process.env.DEBUG) {
            logger.setLevel('trace');
        }

        if (!args.config) {
            logger.info('Please specify a config filename!');
            process.exit(-1); // Cambiado de return -1 a process.exit(-1)
        }

        let config = readAndCheckConfig(logger, args.config)

        let proxies = {};
        for (let onvifConfig of config.onvif) {

            let server = new OnvifServer(logger, onvifConfig);

            if (server.getHostname()) {

                logger.info(`Starting server for ${onvifConfig.name}`);
                server.startHttpServer();
                server.startDiscovery();
                if (process.env.DEBUG)
                    server.enableDebugOutput()

                if (!proxies[onvifConfig.target.hostname])
                    proxies[onvifConfig.target.hostname] = {}

                if (onvifConfig.ports.rtsp && onvifConfig.target.ports.rtsp)
                    proxies[onvifConfig.target.hostname][onvifConfig.ports.rtsp] = onvifConfig.target.ports.rtsp;
                if (onvifConfig.ports.snapshot && onvifConfig.target.ports.snapshot)
                    proxies[onvifConfig.target.hostname][onvifConfig.ports.snapshot] = onvifConfig.target.ports.snapshot;
            } else {
                logger.error(`Failed to find IP address for MAC address ${onvifConfig.mac}`)
                process.exit(-1); // Cambiado de return -1 a process.exit(-1)
            }
        }

        for (let destinationAddress in proxies) {
            for (let sourcePort in proxies[destinationAddress]) {
                logger.info(`PROXY: ${sourcePort} --> ${destinationAddress}:${proxies[destinationAddress][sourcePort]}`);
                try {
                    tcpProxy.createProxy(sourcePort, destinationAddress, proxies[destinationAddress][sourcePort]);
                    logger.info(`Proxy created for ${sourcePort} --> ${destinationAddress}:${proxies[destinationAddress][sourcePort]}`);
                } catch (err) {
                    logger.error(`Failed to create proxy for ${sourcePort} --> ${destinationAddress}:${proxies[destinationAddress][sourcePort]}:`, err);
                    // Continuar con el siguiente proxy en lugar de detener el proceso
                    continue;
                }
            }
        }

        process.exit(0); // Cambiado de return 0 a process.exit(0)
    } catch (err) {
        logger.error('Error en el proceso principal:', err);
        process.exit(-1);
    }
}