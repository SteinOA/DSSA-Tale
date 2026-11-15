using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Management;
using System.Text.RegularExpressions;

// Read-only, short-lived probe. No command lines, filenames, network or credentials.
class DssaResourceProbe {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 struct AdapterDesc {
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)] public string name;
  public uint vendor,device,subsystem,revision;
  public UIntPtr dedicated,system,shared;
  public uint luidLow;public int luidHigh;public uint flags;
 }
 [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid iid,out IntPtr factory);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumAdapter(IntPtr self,uint index,out IntPtr adapter);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetAdapterDesc(IntPtr self,out AdapterDesc desc);
 static string Quote(string text) {return "\""+Regex.Replace(text??"",@"[\x00-\x1f]"," ").Replace("\\","\\\\").Replace("\"","\\\"")+"\"";}
 static int Hardware() {
  IntPtr factory=IntPtr.Zero;
  try {
   var iid=new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
   if(CreateDXGIFactory1(ref iid,out factory)!=0)return 6;
   var enumerate=(EnumAdapter)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(factory),12*IntPtr.Size),typeof(EnumAdapter));
   var json=new StringBuilder("{\"adapters\":[");bool first=true;
   for(uint index=0;index<32;index++) {
    IntPtr adapter;
    if(enumerate(factory,index,out adapter)!=0)break;
    try {
     var getDesc=(GetAdapterDesc)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(adapter),10*IntPtr.Size),typeof(GetAdapterDesc));
     AdapterDesc desc;if(getDesc(adapter,out desc)!=0)continue;
     string vendor=desc.vendor==0x10de?"NVIDIA":desc.vendor==0x1002?"AMD":desc.vendor==0x8086?"Intel":"Other";
     if(!first)json.Append(',');first=false;
     json.Append("{\"name\":").Append(Quote(desc.name)).Append(",\"vendor\":").Append(Quote(vendor))
       .Append(",\"dedicatedBytes\":").Append(desc.dedicated.ToUInt64())
       .Append(",\"sharedBytes\":").Append(desc.shared.ToUInt64())
       .Append(",\"software\":").Append((desc.flags&2)!=0?"true":"false").Append('}');
    } finally {Marshal.Release(adapter);}
   }
   json.Append("]}");Console.Write(json.ToString());return 0;
  } catch {return 6;} finally {if(factory!=IntPtr.Zero)Marshal.Release(factory);}
 }
 static int Gpu(string ids) {
  var selected=new HashSet<int>();
  foreach(string text in ids.Split(',')) {int id;if(!int.TryParse(text,out id)||id<1)return 2;selected.Add(id);}
  if(selected.Count>512)return 2;
  var result=new StringBuilder("{\"engines\":[");bool first=true;
  try {
   using(var search=new ManagementObjectSearcher("SELECT Name,UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine"))
   using(var rows=search.Get()) foreach(ManagementObject row in rows) {
    var match=Regex.Match(Convert.ToString(row["Name"]),@"^pid_(\d+)_(.+)$");
    if(!match.Success||!selected.Contains(int.Parse(match.Groups[1].Value)))continue;
    string engine=match.Groups[2].Value;
    if(!Regex.IsMatch(engine,@"^[a-zA-Z0-9_]+$"))continue;
    if(!first)result.Append(',');first=false;
    result.Append("{\"pid\":").Append(match.Groups[1].Value).Append(",\"engine\":\"").Append(engine)
      .Append("\",\"percent\":").Append(Convert.ToDouble(row["UtilizationPercentage"]).ToString(CultureInfo.InvariantCulture)).Append('}');
   }
   result.Append("],\"memory\":[");first=true;
   using(var search=new ManagementObjectSearcher("SELECT Name,DedicatedUsage,SharedUsage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory"))
   using(var rows=search.Get()) foreach(ManagementObject row in rows) {
    var match=Regex.Match(Convert.ToString(row["Name"]),@"^pid_(\d+)_(.+)$");
    if(!match.Success||!selected.Contains(int.Parse(match.Groups[1].Value)))continue;
    string adapter=match.Groups[2].Value;if(!Regex.IsMatch(adapter,@"^[a-zA-Z0-9_]+$"))continue;
    if(!first)result.Append(',');first=false;
    result.Append("{\"pid\":").Append(match.Groups[1].Value).Append(",\"adapter\":\"").Append(adapter)
      .Append("\",\"dedicatedBytes\":").Append(Convert.ToUInt64(row["DedicatedUsage"]))
      .Append(",\"sharedBytes\":").Append(Convert.ToUInt64(row["SharedUsage"])).Append('}');
   }
   result.Append("]}");Console.Write(result.ToString());return 0;
  } catch {return 5;}
 }
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 struct Entry {
  public uint size, usage, pid; public UIntPtr heap; public uint module, threads, parent;
  public int priority; public uint flags;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string name;
 }
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32First(IntPtr h,ref Entry entry);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32Next(IntPtr h,ref Entry entry);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 static int Main(string[] args) {
  if(args.Length==1 && args[0]=="--hardware")return Hardware();
  if(args.Length==2 && args[0]=="--gpu")return Gpu(args[1]);
  int root;
  if(args.Length!=1 || !int.TryParse(args[0],out root) || root<1) return 2;
  var parents=new Dictionary<int,int>();
  IntPtr snapshot=CreateToolhelp32Snapshot(2,0);
  if(snapshot==new IntPtr(-1)) return 3;
  try {
   var entry=new Entry(); entry.size=(uint)Marshal.SizeOf(typeof(Entry));
   if(!Process32First(snapshot,ref entry)) return 3;
   do { parents[(int)entry.pid]=(int)entry.parent; } while(Process32Next(snapshot,ref entry));
  } finally {CloseHandle(snapshot);}
  var selected=new HashSet<int>(); selected.Add(root);
  bool added=true;
  while(added) {
   added=false;
   foreach(var pair in parents) if(!selected.Contains(pair.Key) && selected.Contains(pair.Value)) {selected.Add(pair.Key); added=true;}
  }
  int self=Process.GetCurrentProcess().Id;
  var output=new StringBuilder("["); bool first=true;
  foreach(int id in selected) {
   if(id==self) continue;
   try {
    using(var p=Process.GetProcessById(id)) {
     long started=(p.StartTime.ToUniversalTime().Ticks-621355968000000000L)/10000;
     double cpu=p.TotalProcessorTime.TotalMilliseconds;
     long ram=p.WorkingSet64;
     if(!first) output.Append(','); first=false;
     output.Append("{\"pid\":").Append(id).Append(",\"parentPid\":").Append(parents.ContainsKey(id)?parents[id]:0)
      .Append(",\"startedAt\":").Append(started).Append(",\"cpuMs\":").Append(cpu.ToString(CultureInfo.InvariantCulture))
      .Append(",\"ramBytes\":").Append(ram).Append('}');
    }
   } catch { if(id==root) return 4; }
  }
  output.Append(']'); Console.Write(output.ToString()); return 0;
 }
}
