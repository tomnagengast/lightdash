import { subject } from '@casl/ability';
import {
    ApiSemanticLayerCreateChart,
    ForbiddenError,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    Organization,
    Project,
    SavedSemanticViewerChart,
    SemanticLayerCreateChart,
    SessionUser,
    SpaceShare,
    SpaceSummary,
    VIZ_DEFAULT_AGGREGATION,
} from '@lightdash/common';
import { uniq } from 'lodash';
import {
    CreateSemanticViewerChartVersionEvent,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSemanticViewerChartModel } from '../../models/SavedSemanticViewerChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';

type SavedSemanticViewerChartServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    savedSemanticViewerChartModel: SavedSemanticViewerChartModel;
};

export class SavedSemanticViewerChartService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly savedSemanticViewerChartModel: SavedSemanticViewerChartModel;

    constructor(args: SavedSemanticViewerChartServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.savedSemanticViewerChartModel = args.savedSemanticViewerChartModel;
    }

    static getCreateVersionEventProperties(
        config: SavedSemanticViewerChart['config'],
        semanticLayerQuery: SavedSemanticViewerChart['semanticLayerQuery'],
    ): Pick<
        CreateSemanticViewerChartVersionEvent['properties'],
        | 'semanticLayerQuery'
        | 'chartKind'
        | 'barChart'
        | 'lineChart'
        | 'pieChart'
    > {
        return {
            semanticLayerQuery,

            chartKind: config.type,

            barChart: isVizBarChartConfig(config)
                ? {
                      groupByCount: (config.fieldConfig?.groupBy ?? []).length,
                      yAxisCount: (config.fieldConfig?.y ?? []).length,
                      aggregationTypes: uniq(
                          (config.fieldConfig?.y ?? []).map(
                              (y) => y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
                          ),
                      ),
                  }
                : undefined,
            lineChart: isVizLineChartConfig(config)
                ? {
                      groupByCount: (config.fieldConfig?.groupBy ?? []).length,
                      yAxisCount: (config.fieldConfig?.y ?? []).length,
                      aggregationTypes: uniq(
                          (config.fieldConfig?.y ?? []).map(
                              (y) => y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
                          ),
                      ),
                  }
                : undefined,
            pieChart: isVizPieChartConfig(config)
                ? {
                      groupByCount: config.fieldConfig?.x ? 1 : 0,
                  }
                : undefined,
        };
    }

    private async hasAccess(
        user: SessionUser,
        action: 'view' | 'create' | 'update' | 'delete' | 'manage',
        {
            spaceUuid,
            projectUuid,
            organizationUuid,
        }: { spaceUuid: string; projectUuid: string; organizationUuid: string },
    ): Promise<{ hasAccess: boolean; userAccess: SpaceShare | undefined }> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );

        const hasPermission = user.ability.can(
            action,
            subject('SavedChart', {
                organizationUuid,
                projectUuid,
                isPrivate: space.isPrivate,
                access,
            }),
        );

        return {
            hasAccess: hasPermission,
            userAccess: access[0],
        };
    }

    // TODO: this should be public but I use this service inside SemanticLayerService.... which is wrong.
    // I think it should be combined now
    async hasSavedChartAccess(
        user: SessionUser,
        action: 'view' | 'create' | 'update' | 'delete' | 'manage',
        savedChart: {
            project: Pick<Project, 'projectUuid'>;
            organization: Pick<Organization, 'organizationUuid'>;
            space: Pick<SpaceSummary, 'uuid'>;
        },
    ) {
        return this.hasAccess(user, action, {
            spaceUuid: savedChart.space.uuid,
            projectUuid: savedChart.project.projectUuid,
            organizationUuid: savedChart.organization.organizationUuid,
        });
    }

    async getSemanticViewerChart(
        user: SessionUser,
        projectUuid: string,
        savedSemanticViewerChartUuid: string | undefined,
        slug?: string,
    ): Promise<SavedSemanticViewerChart> {
        let savedChart;
        if (savedSemanticViewerChartUuid) {
            savedChart = await this.savedSemanticViewerChartModel.getByUuid(
                savedSemanticViewerChartUuid,
                {
                    projectUuid,
                },
            );
        } else if (slug) {
            savedChart = await this.savedSemanticViewerChartModel.getBySlug(
                projectUuid,
                slug,
            );
        } else {
            throw new Error(
                'Either savedSemanticViewerChartUuid or slug must be provided',
            );
        }
        const { hasAccess: hasViewAccess, userAccess } =
            await this.hasSavedChartAccess(user, 'view', savedChart);

        if (!hasViewAccess) {
            throw new ForbiddenError("You don't have access to this chart");
        }
        this.analytics.track({
            event: 'semantic_viewer_chart.view',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSemanticViewerChartUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
            },
        });
        return {
            ...savedChart,
            space: {
                ...savedChart.space,
                userAccess,
            },
        };
    }

    async createSemanticViewerChart(
        user: SessionUser,
        projectUuid: string,
        semanticViewerChart: SemanticLayerCreateChart,
    ): Promise<ApiSemanticLayerCreateChart['results']> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                // TODO: add it's own ability
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const { hasAccess: hasCreateAccess } = await this.hasAccess(
            user,
            'create',
            {
                spaceUuid: semanticViewerChart.spaceUuid,
                projectUuid,
                organizationUuid,
            },
        );

        if (!hasCreateAccess) {
            throw new ForbiddenError(
                "You don't have permission to create this chart",
            );
        }
        const createdChart = await this.savedSemanticViewerChartModel.create(
            user.userUuid,
            projectUuid,
            semanticViewerChart,
        );

        this.analytics.track({
            event: 'semantic_viewer_chart.created',
            userId: user.userUuid,
            properties: {
                chartId: createdChart.savedSemanticViewerChartUuid,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });

        this.analytics.track({
            event: 'semantic_viewer_chart_version.created',
            userId: user.userUuid,
            properties: {
                chartId: createdChart.savedSemanticViewerChartUuid,
                versionId: createdChart.savedSemanticViewerChartVersionUuid,
                projectId: projectUuid,
                organizationId: organizationUuid,
                ...SavedSemanticViewerChartService.getCreateVersionEventProperties(
                    semanticViewerChart.config,
                    semanticViewerChart.semanticLayerQuery,
                ),
            },
        });

        return createdChart;
    }
}