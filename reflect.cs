using System;
using System.Linq;
using System.Reflection;
using System.IO;

class Program
{
    static void Main()
    {
        try {
            var asm = Assembly.LoadFrom(@"C:\Users\Kushagr\.nuget\packages\uipath.gsuite.activities\3.10.0-preview\lib\net6.0-windows7.0\UiPath.GSuite.Activities.dll");
            var type = asm.GetType("UiPath.GSuite.Activities.SendEmailConnections");
            var props = type.GetProperties();
            var output = string.Join("\n", props.Select(p => p.Name + " (" + p.PropertyType.Name + ")"));
            File.WriteAllText("props.txt", output);
        } catch (Exception ex) {
            File.WriteAllText("props.txt", "ERROR: " + ex.Message + "\n" + ex.StackTrace);
        }
    }
}
