import {drizzle} from 'drizzle-orm/libsql';
import {databaseClient} from '@/lib/database';
import * as schema from './schema';
export const getDb=()=>drizzle(databaseClient(),{schema});
