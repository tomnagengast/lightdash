
import { Select, Stack, Text } from '@mantine/core';
import { CaseFormat } from '@lightdash/common';
import { useForm } from 'react-hook-form';
import { useProjectCatalogConfig } from 'hooks/useProject';

export const ProjectLabelSettings = () => {
    const { data: config, mutate } = useProjectCatalogConfig();
    const form = useForm({
        defaultValues: { defaultLabelFormat: config?.defaultLabelFormat }
    });

    return (
        <Stack>
            <Text>Field label format</Text>
            <Select
                value={form.watch('defaultLabelFormat')}
                onChange={(value) => {
                    form.setValue('defaultLabelFormat', value);
                    mutate({ defaultLabelFormat: value });
                }}
                data={[
                    { label: 'Sentence case', value: CaseFormat.SENTENCE_CASE },
                    { label: 'Title Case', value: CaseFormat.TITLE_CASE }
                ]}
            />
            <Text size="sm" color="dimmed">
                Changes will take effect after redeploying the project
            </Text>
        </Stack>
    );
};
