using UiPath.CodedWorkflows;
using System;

namespace Extract_GmailAttachments_ViaKeywords
{
    public class GoogleDocsFactory
    {
        public GoogleDocsFactory(ICodedWorkflowsServiceContainer resolver)
        {
        }
    }

    public class DriveFactory
    {
        public DriveFactory(ICodedWorkflowsServiceContainer resolver)
        {
        }
    }

    public class GoogleFormsFactory
    {
        public GoogleFormsFactory(ICodedWorkflowsServiceContainer resolver)
        {
        }
    }

    public class GmailFactory
    {
        public UiPath.GSuite.Activities.Api.GmailConnection My_Workspace_kushagrgamer26_gmail_com { get; set; }

        public GmailFactory(ICodedWorkflowsServiceContainer resolver)
        {
            My_Workspace_kushagrgamer26_gmail_com = new UiPath.GSuite.Activities.Api.GmailConnection("aa8159d8-46f9-4792-b250-9a68c2a979b9", resolver);
        }
    }

    public class GoogleSheetsFactory
    {
        public GoogleSheetsFactory(ICodedWorkflowsServiceContainer resolver)
        {
        }
    }

    public class GoogleTasksFactory
    {
        public GoogleTasksFactory(ICodedWorkflowsServiceContainer resolver)
        {
        }
    }

    public class GoogleWorkspaceFactory
    {
        public GoogleWorkspaceFactory(ICodedWorkflowsServiceContainer resolver)
        {
        }
    }
}