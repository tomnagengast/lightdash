
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table.string('default_label_format').defaultTo('sentence_case');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('default_label_format');
    });
}
