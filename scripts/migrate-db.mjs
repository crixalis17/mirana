import {cliDatabase,migrate} from './db-cli.mjs';
const client=cliDatabase();
try{await migrate(client);console.log('Mirana database schema is ready.');}finally{client.close();}
